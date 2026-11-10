from contextlib import asynccontextmanager
from datetime import datetime
import hashlib
import os
from pathlib import Path
import secrets
import sqlite3
import time

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

DB_PATH = Path(os.getenv("DATABASE_PATH", Path(__file__).resolve().parents[1] / "tournament.db"))
ACCESS_TTL_SECONDS = 6 * 60 * 60
REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60


def dict_row_factory(cursor, row):
    return {column[0]: row[index] for index, column in enumerate(cursor.description or ())}


def connect():
    remote_url = os.getenv("TURSO_DATABASE_URL")
    if remote_url:
        import turso_serverless

        connection = turso_serverless.connect(
            remote_url,
            auth_token=os.getenv("TURSO_AUTH_TOKEN"),
        )
        connection.row_factory = dict_row_factory
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    if os.getenv("VERCEL_ENV") in {"preview", "production"}:
        raise RuntimeError(
            "Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for persistent Vercel storage."
        )

    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = dict_row_factory
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database():
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                technique_description TEXT NOT NULL DEFAULT '',
                matchplay_description TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT,
                category_id INTEGER NOT NULL REFERENCES categories(id)
            );
            CREATE TABLE IF NOT EXISTS registrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL REFERENCES players(id),
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS admin_sessions (
                token_hash TEXT PRIMARY KEY,
                token_type TEXT NOT NULL,
                expires_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY,
                category_id INTEGER NOT NULL REFERENCES categories(id),
                round TEXT NOT NULL,
                group_name TEXT NOT NULL DEFAULT '',
                court TEXT NOT NULL,
                scheduled_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'scheduled',
                team_a TEXT NOT NULL,
                team_b TEXT NOT NULL,
                score_a INTEGER,
                score_b INTEGER,
                referee TEXT NOT NULL DEFAULT '',
                result_updated_at TEXT
            );
            """
        )

        player_columns = {row["name"] for row in db.execute("PRAGMA table_info(players)")}
        if "group_name" not in player_columns:
            db.execute("ALTER TABLE players ADD COLUMN group_name TEXT NOT NULL DEFAULT ''")
        db.executemany(
            "INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)",
            [("registrations_open", "true"), ("results_published", "false")],
        )

        match_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(matches)")
        }
        if "result_updated_at" not in match_columns:
            db.execute("ALTER TABLE matches ADD COLUMN result_updated_at TEXT")

        category_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(categories)")
        }
        for column in ("technique_description", "matchplay_description"):
            if column not in category_columns:
                db.execute(
                    f"ALTER TABLE categories ADD COLUMN {column} TEXT NOT NULL DEFAULT ''"
                )

        player_columns = {
            row["name"]: row for row in db.execute("PRAGMA table_info(players)")
        }
        if "club" in player_columns or "partner" in player_columns:
            db.execute("PRAGMA foreign_keys = OFF")
            db.executescript(
                """
                BEGIN;
                ALTER TABLE registrations RENAME TO registrations_legacy;
                ALTER TABLE players RENAME TO players_legacy;
                CREATE TABLE players (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    phone TEXT,
                    category_id INTEGER NOT NULL REFERENCES categories(id)
                );
                INSERT INTO players (id, name, phone, category_id)
                SELECT id, name, NULLIF(phone, ''), category_id FROM players_legacy;
                CREATE TABLE registrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    player_id INTEGER NOT NULL REFERENCES players(id),
                    created_at TEXT NOT NULL
                );
                INSERT INTO registrations (id, player_id, created_at)
                SELECT id, player_id, created_at FROM registrations_legacy;
                DROP TABLE registrations_legacy;
                DROP TABLE players_legacy;
                COMMIT;
                """
            )
            db.execute("PRAGMA foreign_keys = ON")

        levels = [
            (
                1,
                "TBY",
                "Trung bình yếu",
                "Nắm luật cơ bản nhưng thao tác còn lóng ngóng. Phông cầu chưa tới cuối sân; bỏ nhỏ và đập cầu còn thiếu lực, cầu chưa cắm. Di chuyển bị động, thường chạy theo cầu.",
                "Dễ mất kiểm soát và hay hỏng các quả cầu đơn giản. Thể lực nhanh đuối khi lượt cầu kéo dài qua 2–3 nhịp.",
            ),
            (
                2,
                "TB",
                "Trung bình chuẩn",
                "Nắm vững kỹ thuật cơ bản: phông sâu gần hết sân, phát cầu ổn định, biết chém và bỏ nhỏ. Bắt đầu điều cầu, tìm khoảng trống để đưa cầu đi.",
                "Lối chơi ổn định, phán đoán hướng cầu khá tốt. Biết phối hợp vị trí khi đánh đôi, phân biệt tương đối rõ tấn công và phòng thủ.",
            ),
            (
                3,
                "TB+",
                "Trung bình cộng / Trung bình khá",
                "Kỹ thuật cơ bản thành thạo khoảng 70–80%; xử lý nhanh các tình huống phản tạt, kê cầu và đập cầu uy lực hơn. Di chuyển chủ động cả bốn góc sân.",
                "Biết đọc trận đấu, phân phối sức và phòng thủ nhiều hướng. Nhịp độ thi đấu nhanh, ít mắc lỗi tự đánh hỏng.",
            ),
            (
                4,
                "Khá",
                "Trình độ khá",
                "Kỹ thuật toàn diện, đường cầu sắc bén và có tư duy chiến thuật rõ ràng. Thực hiện thuần thục các tình huống khó bằng cả tay thuận lẫn trái tay.",
                "Xử lý nhạy bén dưới áp lực cao, phản xạ nhanh. Thể lực tốt, có thể làm chủ thế trận trước đối thủ ở trình độ thấp hơn.",
            ),
        ]
        db.executemany(
            """INSERT INTO categories
            (id, name, description, technique_description, matchplay_description)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                technique_description = excluded.technique_description,
                matchplay_description = excluded.matchplay_description""",
            levels,
        )

        seeded_players = [
            ("Minh Anh", "0901234567"),
            ("Quang Huy", "0902345678"),
            ("Thu Hà", "0903456789"),
            ("Đức Anh", "0904567890"),
            ("Gia Bảo", "0905678901"),
            ("Ngọc Lan", "0906789012"),
            ("Hoàng Nam", "0907890123"),
            ("Tuấn Kiệt", "0908901234"),
            ("Mai Phương", "0909012345"),
            ("Bảo Trân", "0910123456"),
        ]
        seeded_matches = [
            (1, "Minh Anh / Quang Huy", "Thu Hà / Đức Anh"),
            (2, "Gia Bảo / Ngọc Lan", "Minh Anh / Quang Huy"),
            (3, "Thu Hà / Đức Anh", "Gia Bảo / Ngọc Lan"),
            (4, "Nhất bảng A", "Nhì bảng B"),
            (5, "Hoàng Nam / Tuấn Kiệt", "Đội hạt giống số 2"),
            (6, "Mai Phương / Bảo Trân", "Đội hạt giống số 2"),
        ]
        db.executemany(
            "DELETE FROM matches WHERE id = ? AND team_a = ? AND team_b = ?",
            seeded_matches,
        )
        db.executemany(
            """DELETE FROM players WHERE name = ? AND phone = ?
            AND NOT EXISTS (
                SELECT 1 FROM registrations WHERE registrations.player_id = players.id
            )""",
            seeded_players,
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Lavita Garden Open 2026 API", version="1.0.0", lifespan=lifespan)
cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def serialize_match(row):
    return {
        "id": row["id"],
        "category": row["category"],
        "round": row["round"],
        "group_name": row["group_name"],
        "court": row["court"],
        "scheduled_at": row["scheduled_at"],
        "status": row["status"],
        "team_a": row["team_a"],
        "team_b": row["team_b"],
        "score_a": row["score_a"],
        "score_b": row["score_b"],
        "referee": row["referee"],
        "result_updated_at": row["result_updated_at"],
    }


@app.get("/api/categories")
def get_categories():
    with connect() as db:
        return [
            dict(row)
            for row in db.execute(
                """SELECT id, name, description, technique_description,
                matchplay_description FROM categories ORDER BY id"""
            )
        ]


@app.get("/api/stats")
def get_stats():
    with connect() as db:
        player_count = db.execute(
            "SELECT COUNT(*) AS count FROM players"
        ).fetchone()["count"]
        match_count = db.execute(
            "SELECT COUNT(*) AS count FROM matches"
        ).fetchone()["count"]
        return {"registered_players": player_count, "matches": match_count}


@app.get("/api/matches")
def get_matches():
    with connect() as db:
        published = db.execute("SELECT value FROM app_settings WHERE key = 'results_published'").fetchone()
        rows = db.execute(
            """SELECT m.*, c.name AS category FROM matches m
            JOIN categories c ON c.id = m.category_id ORDER BY m.scheduled_at, m.court"""
        ).fetchall()
        matches = [serialize_match(row) for row in rows]
        if not published or published["value"] != "true":
            for match in matches:
                match["score_a"] = None
                match["score_b"] = None
                if match["status"] == "finished":
                    match["status"] = "scheduled"
        return matches


@app.get("/api/standings")
def get_standings(category_id: int = Query(1, ge=1)):
    with connect() as db:
        published = db.execute("SELECT value FROM app_settings WHERE key = 'results_published'").fetchone()
    if not published or published["value"] != "true":
        return []
    return standings_for_category(category_id)


def standings_for_category(category_id: int):
    with connect() as db:
        category = db.execute("SELECT id FROM categories WHERE id = ?", (category_id,)).fetchone()
        if category is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy nội dung thi đấu.")
        matches = db.execute(
            """SELECT group_name, status, team_a, team_b, score_a, score_b
            FROM matches
            WHERE category_id = ? AND group_name LIKE 'Bảng %'
            ORDER BY group_name, scheduled_at""",
            (category_id,),
        ).fetchall()
    groups = {}

    for match in matches:
        group = groups.setdefault(match["group_name"], {})
        pair_a = match["team_a"].strip()
        pair_b = match["team_b"].strip()
        pair_stats = [
            group.setdefault(
                pair,
                {
                    "pair": pair,
                    "played": 0,
                    "wins": 0,
                    "losses": 0,
                    "points": 0,
                    "score_for": 0,
                    "score_against": 0,
                },
            )
            for pair in (pair_a, pair_b)
        ]

        if match["status"] != "finished" or match["score_a"] is None or match["score_b"] is None:
            continue

        stats_a, stats_b = pair_stats
        stats_a["played"] += 1
        stats_b["played"] += 1
        stats_a["score_for"] += match["score_a"]
        stats_a["score_against"] += match["score_b"]
        stats_b["score_for"] += match["score_b"]
        stats_b["score_against"] += match["score_a"]

        if match["score_a"] > match["score_b"]:
            stats_a["wins"] += 1
            stats_a["points"] += 1
            stats_b["losses"] += 1
        elif match["score_b"] > match["score_a"]:
            stats_b["wins"] += 1
            stats_b["points"] += 1
            stats_a["losses"] += 1

    result = []
    for group_name, pairs in sorted(groups.items()):
        ordered_pairs = sorted(
            pairs.values(),
            key=lambda pair: (
                -pair["points"],
                -pair["wins"],
                -(pair["score_for"] - pair["score_against"]),
                -pair["score_for"],
                pair["pair"],
            ),
        )
        result.append(
            {
                "group_name": group_name,
                "rows": [
                    {
                        "rank": rank,
                        "pair": pair["pair"],
                        "played": pair["played"],
                        "wins": pair["wins"],
                        "losses": pair["losses"],
                        "points": pair["points"],
                        "score_diff": pair["score_for"] - pair["score_against"],
                    }
                    for rank, pair in enumerate(ordered_pairs, start=1)
                ],
            }
        )
    return result


@app.get("/api/admin/standings/{category_id}")
def get_admin_standings(category_id: int, authorization: str | None = Header(default=None)):
    require_admin(authorization)
    return standings_for_category(category_id)


@app.get("/api/players")
def get_players(search: str = Query("", max_length=80)):
    with connect() as db:
        rows = db.execute(
            """SELECT p.id, p.name, c.name AS category
            FROM players p JOIN categories c ON c.id = p.category_id
            WHERE p.name LIKE ? ORDER BY p.name LIMIT 20""",
            (f"%{search}%",),
        ).fetchall()
        return [dict(row) for row in rows]


@app.get("/api/players/{player_id}/schedule")
def get_player_schedule(player_id: int):
    with connect() as db:
        player = db.execute(
            """SELECT p.id, p.name, c.name AS category
            FROM players p JOIN categories c ON c.id = p.category_id WHERE p.id = ?""",
            (player_id,),
        ).fetchone()
        if player is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy vận động viên.")
        matches = db.execute(
            """SELECT m.*, c.name AS category FROM matches m
            JOIN categories c ON c.id = m.category_id
            WHERE m.team_a LIKE ? OR m.team_b LIKE ? ORDER BY m.scheduled_at""",
            (f"%{player['name']}%", f"%{player['name']}%"),
        ).fetchall()
        return {"player": dict(player), "matches": [serialize_match(row) for row in matches]}


class Registration(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    category_id: int = Field(ge=1)

    @field_validator("phone", mode="before")
    @classmethod
    def empty_phone_is_optional(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value


class MatchResult(BaseModel):
    score_a: int = Field(ge=0, le=30)
    score_b: int = Field(ge=0, le=30)

    @field_validator("score_b")
    @classmethod
    def scores_must_have_a_winner(cls, score_b, info):
        score_a = info.data.get("score_a")
        if score_a is not None and score_a == score_b:
            raise ValueError("Trận đấu không có kết quả hòa.")
        return score_b


class AdminLogin(BaseModel):
    token: str = Field(min_length=1, max_length=500)


def issue_admin_session():
    access_token = secrets.token_urlsafe(36)
    refresh_token = secrets.token_urlsafe(48)
    now = time.time()
    with connect() as db:
        db.execute("DELETE FROM admin_sessions WHERE expires_at <= ?", (now,))
        db.executemany(
            "INSERT INTO admin_sessions (token_hash, token_type, expires_at) VALUES (?, ?, ?)",
            [
                (hashlib.sha256(access_token.encode()).hexdigest(), "access", now + ACCESS_TTL_SECONDS),
                (hashlib.sha256(refresh_token.encode()).hexdigest(), "refresh", now + REFRESH_TTL_SECONDS),
            ],
        )
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": ACCESS_TTL_SECONDS,
    }


def require_admin(authorization: str | None):
    supplied = authorization.removeprefix("Bearer ") if authorization else ""
    token_hash = hashlib.sha256(supplied.encode()).hexdigest()
    with connect() as db:
        session = db.execute(
            "SELECT expires_at FROM admin_sessions WHERE token_hash = ? AND token_type = 'access'",
            (token_hash,),
        ).fetchone()
    if not session or session["expires_at"] <= time.time():
        raise HTTPException(status_code=401, detail="Phiên quản trị hết hạn. Vui lòng đăng nhập lại.")


@app.post("/api/admin/session")
def create_admin_session(payload: AdminLogin):
    admin_token = os.getenv("ADMIN_TOKEN")
    if not admin_token:
        raise HTTPException(status_code=503, detail="Chưa cấu hình quyền quản trị.")
    if not secrets.compare_digest(payload.token, admin_token):
        raise HTTPException(status_code=401, detail="Mã quản trị không hợp lệ.")
    return issue_admin_session()


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=200)


@app.post("/api/admin/refresh")
def refresh_admin_session(payload: RefreshRequest):
    token_hash = hashlib.sha256(payload.refresh_token.encode()).hexdigest()
    with connect() as db:
        session = db.execute(
            "SELECT expires_at FROM admin_sessions WHERE token_hash = ? AND token_type = 'refresh'",
            (token_hash,),
        ).fetchone()
        if not session or session["expires_at"] <= time.time():
            if session:
                db.execute("DELETE FROM admin_sessions WHERE token_hash = ?", (token_hash,))
            raise HTTPException(status_code=401, detail="Phiên quản trị hết hạn. Vui lòng đăng nhập lại.")
        db.execute("DELETE FROM admin_sessions WHERE token_hash = ?", (token_hash,))
    return issue_admin_session()


@app.get("/api/admin/overview")
def admin_overview(authorization: str | None = Header(default=None)):
    require_admin(authorization)
    with connect() as db:
        players = db.execute(
            """SELECT p.id, p.name, p.phone, p.group_name, p.category_id, c.name AS category
            FROM players p JOIN categories c ON c.id = p.category_id ORDER BY c.id, p.name"""
        ).fetchall()
        settings = {row["key"]: row["value"] == "true" for row in db.execute("SELECT key, value FROM app_settings")}
        matches = db.execute("""SELECT m.*, c.name AS category FROM matches m
            JOIN categories c ON c.id = m.category_id ORDER BY m.scheduled_at, m.court""").fetchall()
        categories = db.execute("SELECT id, name FROM categories ORDER BY id").fetchall()
        return {"players": [dict(row) for row in players], "settings": settings,
                "matches": [serialize_match(row) for row in matches], "categories": [dict(row) for row in categories]}


class PlayerAssignment(BaseModel):
    group_name: str = Field(default="", max_length=40)
    category_id: int = Field(ge=1)


@app.put("/api/admin/players/{player_id}")
def assign_player(player_id: int, payload: PlayerAssignment, authorization: str | None = Header(default=None)):
    require_admin(authorization)
    with connect() as db:
        if not db.execute("SELECT id FROM players WHERE id = ?", (player_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy vận động viên.")
        if not db.execute("SELECT id FROM categories WHERE id = ?", (payload.category_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Trình độ thi đấu không hợp lệ.")
        db.execute("UPDATE players SET group_name = ?, category_id = ? WHERE id = ?", (payload.group_name.strip(), payload.category_id, player_id))
        return {"message": "Đã cập nhật vận động viên và nhóm."}


class TournamentSetting(BaseModel):
    enabled: bool


@app.put("/api/admin/settings/{setting_name}")
def update_setting(setting_name: str, payload: TournamentSetting, authorization: str | None = Header(default=None)):
    require_admin(authorization)
    setting_keys = {"registrations": "registrations_open", "results": "results_published"}
    key = setting_keys.get(setting_name)
    if not key:
        raise HTTPException(status_code=404, detail="Không tìm thấy thiết lập.")
    with connect() as db:
        db.execute("UPDATE app_settings SET value = ? WHERE key = ?", ("true" if payload.enabled else "false", key))
    return {"message": "Đã cập nhật thiết lập."}


@app.put("/api/admin/matches/{match_id}/result")
def update_match_result(
    match_id: int,
    payload: MatchResult,
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    with connect() as db:
        match = db.execute("SELECT id FROM matches WHERE id = ?", (match_id,)).fetchone()
        if match is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy trận đấu.")
        updated_at = datetime.now().astimezone().isoformat(timespec="milliseconds")
        db.execute(
            """UPDATE matches SET score_a = ?, score_b = ?, status = 'finished',
            result_updated_at = ? WHERE id = ?""",
            (payload.score_a, payload.score_b, updated_at, match_id),
        )
        return {"message": "Đã cập nhật kết quả trận đấu.", "updated_at": updated_at}


@app.post("/api/registrations", status_code=201)
def create_registration(payload: Registration):
    with connect() as db:
        open_setting = db.execute("SELECT value FROM app_settings WHERE key = 'registrations_open'").fetchone()
        if open_setting and open_setting["value"] != "true":
            raise HTTPException(status_code=403, detail="Form đăng ký hiện đã đóng.")
        category = db.execute("SELECT id FROM categories WHERE id = ?", (payload.category_id,)).fetchone()
        if category is None:
            raise HTTPException(status_code=404, detail="Trình độ thi đấu không hợp lệ.")
        cursor = db.execute(
            """INSERT INTO players (name, phone, category_id)
            VALUES (?, ?, ?)""",
            (payload.name.strip(), payload.phone.strip() if payload.phone else None, payload.category_id),
        )
        db.execute("INSERT INTO registrations (player_id, created_at) VALUES (?, ?)", (cursor.lastrowid, datetime.now().isoformat(timespec="seconds")))
        return {"message": "Đăng ký thành công! BTC sẽ xác nhận thông tin của bạn."}


@app.get("/health")
def health():
    return {"status": "ok"}
