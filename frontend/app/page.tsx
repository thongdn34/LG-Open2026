"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Category, Match } from "@/lib/api";

const tabs = [
  "Đăng ký",
  "Bảng đấu",
  "Lịch thi đấu",
  "Xếp hạng",
  "Tra cứu",
  "Thể lệ thi đấu",
] as const;
type Tab = (typeof tabs)[number];

const matchTime = (value: string) =>
  new Date(value).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
const matchDate = (value: string) =>
  new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("Đăng ký");
  const [heroNavigation, setHeroNavigation] = useState<Tab | null>(null);
  const [categoryId, setCategoryId] = useState(1);
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [newResult, setNewResult] = useState<Match | null>(null);
  const queryClient = useQueryClient();
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories,
  });
  const matches = useQuery({
    queryKey: ["matches"],
    queryFn: api.matches,
    refetchInterval: 30_000,
  });
  const standings = useQuery({
    queryKey: ["standings", categoryId],
    queryFn: () => api.standings(categoryId),
    enabled: activeTab === "Xếp hạng",
    refetchInterval: activeTab === "Xếp hạng" ? 30_000 : false,
  });
  const players = useQuery({
    queryKey: ["players", playerSearch],
    queryFn: () => api.players(playerSearch),
    enabled: activeTab === "Tra cứu",
  });
  const schedule = useQuery({
    queryKey: ["player-schedule", selectedPlayer],
    queryFn: () => api.playerSchedule(selectedPlayer!),
    enabled: selectedPlayer !== null,
    refetchInterval: selectedPlayer !== null ? 30_000 : false,
  });
  const registration = useMutation({
    mutationFn: api.register,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stats"] }),
  });
  const list = matches.data ?? [];
  const categoriesList = categories.data ?? [];
  const upcoming = useMemo(
    () => list.filter((match) => match.status !== "finished"),
    [list],
  );
  const latestResult = useMemo(
    () =>
      list
        .filter(
          (match) => match.status === "finished" && match.result_updated_at,
        )
        .sort((a, b) =>
          (b.result_updated_at ?? "").localeCompare(a.result_updated_at ?? ""),
        )[0],
    [list],
  );

  useEffect(() => {
    if (!latestResult?.result_updated_at) {
      return;
    }

    const storageKey = "lavita-last-result-seen";
    const seenAt = window.localStorage.getItem(storageKey);
    if (!seenAt || latestResult.result_updated_at > seenAt) {
      setNewResult(latestResult);
    }
    if (!seenAt || latestResult.result_updated_at > seenAt) {
      window.localStorage.setItem(storageKey, latestResult.result_updated_at);
    }
  }, [latestResult]);

  useEffect(() => {
    if (!heroNavigation || heroNavigation !== activeTab) {
      return;
    }

    const targetId =
      heroNavigation === "Đăng ký" ? "registration-form" : "competition-tabs";
    document.getElementById(targetId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setHeroNavigation(null);
  }, [activeTab, heroNavigation]);

  function navigateToTab(tab: Tab) {
    setActiveTab(tab);
    setHeroNavigation(tab);
  }

  function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    registration.mutate({
      name: String(form.get("name")),
      phone: String(form.get("phone") ?? "").trim() || null,
      category_id: Number(form.get("category_id")),
    });
    event.currentTarget.reset();
  }

  return (
    <main>
      <header className="masthead">
        <a
          className="brand"
          href="#top"
          aria-label="Lavita Garden Open 2026, trang chủ"
        >
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" role="img">
              <path d="M24 5 8 38h7l9-19 9 19h7L24 5Z" />
              <path d="m14 31 20 1m-17-8 14 1m-11-8 8 1" />
            </svg>
          </span>
          <span>
            <small>GẮN KẾT ĐAM MÊ</small>
            <strong>LAVITA GARDEN OPEN 2026</strong>
          </span>
        </a>
        <div className="season-label">
          <i /> GIẢI CẦU LÔNG · MÙA GIẢI 2026
        </div>
      </header>
      {newResult && (
        <aside className="result-notice" role="status">
          <span className="result-notice-icon">✓</span>
          <span>
            <strong>Kết quả trận đấu vừa được cập nhật</strong>
            <small>
              {newResult.team_a} {newResult.score_a} – {newResult.score_b}{" "}
              {newResult.team_b}
            </small>
          </span>
          <button
            type="button"
            aria-label="Đóng thông báo"
            onClick={() => setNewResult(null)}
          >
            ×
          </button>
        </aside>
      )}

      <section className="hero" id="top">
        <div className="hero-orbit orbit-one" />
        <div className="hero-orbit orbit-two" />
        <div className="hero-year" aria-hidden="true">
          26
        </div>
        <div className="hero-content">
          <p className="eyebrow">
            MÙA GIẢI 2026 <span>—</span> LAVITA GARDEN OPEN
          </p>
          <h1>
            Hết mình trên sân.
            <br />
            <em>Chạm tới vinh quang.</em>
          </h1>
          <p className="hero-intro">
            Tham gia Lavita Garden Open 2026, theo dõi lịch thi đấu và cổ vũ
            đồng đội tại Galaxy Thủ Đức.
          </p>
          <a
            className="venue-link"
            href="https://maps.app.goo.gl/hUEdJXFkEhqYrz347"
            target="_blank"
            rel="noreferrer"
          >
            <span>ĐỊA ĐIỂM THI ĐẤU</span>
            <strong>Galaxy Thủ Đức</strong>
            <b aria-hidden="true">↗</b>
          </a>
          <div className="hero-actions">
            <button
              className="button yellow"
              onClick={() => navigateToTab("Lịch thi đấu")}
            >
              Xem lịch thi đấu <span>↗</span>
            </button>
            <button
              className="text-link"
              onClick={() => navigateToTab("Đăng ký")}
            >
              Đăng ký tham gia <span>↓</span>
            </button>
          </div>
        </div>
        <div className="hero-bottom">
          <span>THI ĐẤU HẾT MÌNH · KẾT NỐI ĐAM MÊ</span>
          <span>{upcoming.length} TRẬN SẮP DIỄN RA</span>
        </div>
      </section>

      <section className="dashboard section-pad">
        <div className="section-tag">
          <span>01 / TRUNG TÂM GIẢI ĐẤU</span>
          <div />
        </div>
        <div className="dashboard-heading">
          <div>
            <h2>
              Theo dõi mùa giải.
              <br />
              <span>Chủ động từng trận.</span>
            </h2>
            <p>Thông tin mới nhất dành cho vận động viên và người hâm mộ.</p>
          </div>
          <div className="live-mark">
            <i /> MÙA GIẢI 2026
          </div>
        </div>
        <div className="stats-row">
          <div>
            <strong>04</strong>
            <span>trình độ thi đấu</span>
          </div>
          <div>
            <strong>
              {(stats.data?.registered_players ?? 0)
                .toString()
                .padStart(2, "0")}
            </strong>
            <span>vận động viên đăng ký</span>
          </div>
          <div>
            <strong>
              {(stats.data?.matches ?? list.length).toString().padStart(2, "0")}
            </strong>
            <span>trận đấu trong lịch</span>
          </div>
          <p>
            Trên sân là đối thủ.
            <br />
            <em>Sau trận là đồng đội.</em>
          </p>
        </div>
      </section>

      <section className="competition section-pad" id="competition">
        <div className="section-tag">
          <span>02 / THÔNG TIN THI ĐẤU</span>
          <div />
        </div>
        <div
          className="tab-bar"
          id="competition-tabs"
          role="tablist"
          aria-label="Thông tin giải đấu"
        >
          {tabs.map((tab, index) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              <span className="tab-index">0{index + 1}</span>
              {tab}
            </button>
          ))}
        </div>
        <div className="tab-content">
          {activeTab === "Đăng ký" && (
            <div className="content-grid">
              <div className="panel-intro">
                <span className="panel-icon">↗</span>
                <h3>
                  Chọn đúng trình độ.
                  <br />
                  <em>Chơi hết mình.</em>
                </h3>
                <p>
                  Để BTC xếp nội dung phù hợp, hãy cung cấp thông tin và chọn
                  trình độ thi đấu của bạn.
                </p>
                <div className="note">
                  <b>✳</b>
                  <span>
                    Thông tin đăng ký chỉ dùng cho công tác tổ chức giải.
                  </span>
                </div>
              </div>
              <form
                className="form-card"
                id="registration-form"
                onSubmit={submitRegistration}
              >
                <div className="form-heading">
                  <span>PHIẾU ĐĂNG KÝ VẬN ĐỘNG VIÊN</span>
                  <b>01 / 01</b>
                </div>
                <label>
                  Họ và tên <span>*</span>
                  <input name="name" required placeholder="Tên vận động viên" />
                </label>
                <div className="form-row">
                  <label>
                    Số điện thoại <small>(không bắt buộc)</small>
                    <input name="phone" type="tel" placeholder="09xx xxx xxx" />
                  </label>
                </div>
                <fieldset className="level-picker">
                  <legend>
                    Trình độ thi đấu <span>*</span>
                  </legend>
                  {categoriesList.map((category) => (
                    <label className="level-option" key={category.id}>
                      <input
                        type="radio"
                        name="category_id"
                        value={category.id}
                        required
                        defaultChecked={category.id === 1}
                      />
                      <span className="level-option-copy">
                        <strong>{category.name}</strong>
                        <small>{category.description}</small>
                        <span className="level-details">
                          <span>
                            <b>KỸ THUẬT & DI CHUYỂN</b>
                            <small>{category.technique_description}</small>
                          </span>
                          <span>
                            <b>THỰC CHIẾN & THỂ LỰC</b>
                            <small>{category.matchplay_description}</small>
                          </span>
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                {registration.isSuccess && (
                  <p className="form-status success" role="status">
                    {registration.data.message}
                  </p>
                )}
                {registration.isError && (
                  <p className="form-status error" role="alert">
                    {registration.error.message}
                  </p>
                )}
                <button
                  className="button yellow submit"
                  disabled={registration.isPending}
                >
                  {registration.isPending ? "Đang gửi…" : "Gửi đăng ký"}
                  <span>↗</span>
                </button>
                <p className="form-footnote">
                  BTC có thể liên hệ nếu bạn để lại số điện thoại.
                </p>
              </form>
            </div>
          )}
          {activeTab === "Bảng đấu" && (
            <Bracket matches={list} categories={categoriesList} />
          )}
          {activeTab === "Lịch thi đấu" && <Schedule matches={list} />}
          {activeTab === "Thể lệ thi đấu" && (
            <Rules categories={categoriesList} />
          )}
          {activeTab === "Xếp hạng" && (
            <div className="listing-panel">
              <div className="listing-heading">
                <div>
                  <span className="eyebrow">THỨ HẠNG HIỆN TẠI</span>
                  <h3>Bảng xếp hạng</h3>
                </div>
                <select
                  className="filter-select"
                  value={categoryId}
                  onChange={(event) =>
                    setCategoryId(Number(event.target.value))
                  }
                >
                  {categoriesList.map((category) => (
                    <option value={category.id} key={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              {(standings.data ?? []).map((group) => (
                <section className="standing-group" key={group.group_name}>
                  <div className="standing-group-heading">
                    <h4>{group.group_name}</h4>
                    <span>{group.rows.length} cặp thi đấu</span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>HẠNG</th>
                          <th>CẶP VẬN ĐỘNG VIÊN</th>
                          <th>ĐÃ ĐẤU</th>
                          <th>THẮNG</th>
                          <th>THUA</th>
                          <th>HIỆU SỐ</th>
                          <th>ĐIỂM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={row.pair}>
                            <td>
                              <span
                                className={
                                  row.rank === 1 ? "rank medal" : "rank"
                                }
                              >
                                {String(row.rank).padStart(2, "0")}
                              </span>
                            </td>
                            <td className="strong-cell">{row.pair}</td>
                            <td>{row.played}</td>
                            <td>{row.wins}</td>
                            <td>{row.losses}</td>
                            <td>
                              {row.score_diff > 0 ? "+" : ""}
                              {row.score_diff}
                            </td>
                            <td className="points">{row.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
              {standings.isLoading && (
                <p className="empty-state">Đang tải bảng xếp hạng…</p>
              )}
              {standings.data?.length === 0 && !standings.isLoading && (
                <p className="empty-state">
                  Chưa có cặp đấu trong vòng bảng của nội dung này.
                </p>
              )}
            </div>
          )}
          {activeTab === "Tra cứu" && (
            <div className="lookup-layout">
              <div className="lookup-intro">
                <span className="eyebrow">TÌM THEO VẬN ĐỘNG VIÊN</span>
                <h3>
                  Lịch của bạn,
                  <br />
                  <em>trong tầm tay.</em>
                </h3>
                <p>
                  Chọn tên vận động viên để xem giờ thi đấu, đối thủ, sân và
                  trọng tài.
                </p>
                <label className="search-label">
                  Tìm vận động viên
                  <input
                    value={playerSearch}
                    onChange={(event) => setPlayerSearch(event.target.value)}
                    placeholder="Nhập tên cần tìm…"
                  />
                </label>
                <div className="player-options">
                  {players.data?.map((player) => (
                    <button
                      className={selectedPlayer === player.id ? "selected" : ""}
                      key={player.id}
                      onClick={() => setSelectedPlayer(player.id)}
                    >
                      <span className="avatar">{player.name.charAt(0)}</span>
                      <span>
                        <b>{player.name}</b>
                        <small>{player.category}</small>
                      </span>
                      <span className="option-arrow">↗</span>
                    </button>
                  ))}
                </div>
                {players.isLoading && <p className="muted">Đang tìm…</p>}
              </div>
              <div className="lookup-results">
                {schedule.data ? (
                  <>
                    <div className="lookup-player">
                      <div className="avatar large">
                        {schedule.data.player.name.charAt(0)}
                      </div>
                      <div>
                        <span className="eyebrow">LỊCH THI ĐẤU CÁ NHÂN</span>
                        <h4>{schedule.data.player.name}</h4>
                        <p>Trình độ {schedule.data.player.category}</p>
                      </div>
                    </div>
                    <div className="personal-matches">
                      {schedule.data.matches.map((match) => (
                        <MatchCard key={match.id} match={match} compact />
                      ))}
                      {schedule.data.matches.length === 0 && (
                        <p className="empty-state">
                          Chưa có trận được xếp lịch cho vận động viên này.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="empty-lookup">
                    <span>⌕</span>
                    <h4>Chọn vận động viên</h4>
                    <p>Lịch thi đấu chi tiết sẽ hiển thị tại đây.</p>
                  </div>
                )}
              </div>
            </div>
          )}
          {matches.isError && (
            <p className="form-status error" role="alert">
              {matches.error.message}
            </p>
          )}
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-wordmark">
          LAVITA GARDEN <span>OPEN</span> 2026
        </div>
        <div>
          <p>Thi đấu bằng đam mê. Kết nối bằng thể thao.</p>
          <span>GẮN KẾT ĐAM MÊ · HẸN GẶP BẠN TRÊN SÂN</span>
        </div>
        <a className="footer-admin-link" href="/admin">
          Quản trị
        </a>
        <a href="#top" aria-label="Về đầu trang">
          ↑
        </a>
      </footer>
    </main>
  );
}

function Rules({ categories }: { categories: Category[] }) {
  return (
    <div className="rules-panel">
      <div className="listing-heading">
        <div>
          <span className="eyebrow">THỂ LỆ VÀ HƯỚNG DẪN</span>
          <h3>Thi đấu công bằng, đúng trình độ.</h3>
        </div>
      </div>
      <p className="rules-intro">
        Ban tổ chức chia bảng theo trình độ đăng ký. Vui lòng chọn mức sát với
        kỹ năng hiện tại để các trận đấu cân bằng và vui hơn.
      </p>
      <div className="rules-levels">
        {categories.map((category) => (
          <article className="rules-level-card" key={category.id}>
            <div className="rules-level-title">
              <h4>{category.name}</h4>
              <span>{category.description}</span>
            </div>
            <div className="rules-detail-grid">
              <div>
                <b>KỸ THUẬT & DI CHUYỂN</b>
                <p>{category.technique_description}</p>
              </div>
              <div>
                <b>THỰC CHIẾN & THỂ LỰC</b>
                <p>{category.matchplay_description}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="rules-guidance-grid">
        <article>
          <span>01</span>
          <h4>Xếp hạng vòng bảng</h4>
          <p>
            Thắng được 1 điểm, thua được 0 điểm và không có kết quả hòa. Nếu
            bằng điểm, bảng xếp hạng xét hiệu số điểm rồi tổng điểm ghi được.
          </p>
        </article>
        <article>
          <span>02</span>
          <h4>Lịch và trọng tài</h4>
          <p>
            Giờ thi đấu, sân, cặp đối đầu và trọng tài được hiển thị trong tab
            Lịch thi đấu. Hãy kiểm tra lịch trước khi vào sân.
          </p>
        </article>
        <article>
          <span>03</span>
          <h4>Kết quả trận đấu</h4>
          <p>
            Kết quả do ban tổ chức cập nhật sẽ xuất hiện ở lịch thi đấu và bảng
            xếp hạng. Vui lòng báo trọng tài nếu cần đối chiếu tỷ số.
          </p>
        </article>
      </div>
      <p className="rules-note">
        Thể thức cụ thể của từng vòng và mọi điều chỉnh tại sân sẽ do ban tổ
        chức thông báo.
      </p>
    </div>
  );
}

function Bracket({
  matches,
  categories,
}: {
  matches: Match[];
  categories: { id: number; name: string }[];
}) {
  const [category, setCategory] = useState("Tất cả nội dung");
  const visible =
    category === "Tất cả nội dung"
      ? matches
      : matches.filter((match) => match.category === category);
  const groups = Array.from(
    new Set(
      visible.map(
        (match) => `${match.category} · ${match.group_name || match.round}`,
      ),
    ),
  );
  return (
    <div className="listing-panel">
      <div className="listing-heading">
        <div>
          <span className="eyebrow">SƠ ĐỒ THI ĐẤU</span>
          <h3>Bảng đấu & cặp đấu</h3>
        </div>
        <select
          className="filter-select"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option>Tất cả nội dung</option>
          {categories.map((item) => (
            <option key={item.id}>{item.name}</option>
          ))}
        </select>
      </div>
      <div className="bracket-grid">
        {groups.map((group) => (
          <div className="group-column" key={group}>
            <div className="group-title">
              <span>{group}</span>
              <i>VÒNG BẢNG</i>
            </div>
            {visible
              .filter(
                (match) =>
                  `${match.category} · ${match.group_name || match.round}` ===
                  group,
              )
              .map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
          </div>
        ))}
        {groups.length === 0 && (
          <p className="empty-state">Chưa có bảng đấu cho nội dung này.</p>
        )}
      </div>
    </div>
  );
}

function Schedule({ matches }: { matches: Match[] }) {
  const [filter, setFilter] = useState("Tất cả");
  const days = Array.from(
    new Set(matches.map((match) => matchDate(match.scheduled_at))),
  );
  const visible =
    filter === "Tất cả"
      ? matches
      : matches.filter((match) => matchDate(match.scheduled_at) === filter);
  return (
    <div className="listing-panel">
      <div className="listing-heading">
        <div>
          <span className="eyebrow">CẬP NHẬT TỪ BAN TỔ CHỨC</span>
          <h3>Lịch thi đấu</h3>
        </div>
        <select
          className="filter-select"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option>Tất cả</option>
          {days.map((day) => (
            <option key={day}>{day}</option>
          ))}
        </select>
      </div>
      <div className="schedule-list">
        {visible.map((match) => (
          <MatchCard key={match.id} match={match} schedule />
        ))}
        {visible.length === 0 && (
          <p className="empty-state">Chưa có trận đấu trong ngày này.</p>
        )}
      </div>
    </div>
  );
}

function MatchCard({
  match,
  compact = false,
  schedule = false,
}: {
  match: Match;
  compact?: boolean;
  schedule?: boolean;
}) {
  const finished = match.status === "finished";
  return (
    <article
      className={`match-card${compact ? " compact" : ""}${schedule ? " schedule-card" : ""}`}
    >
      {schedule && (
        <div className="match-when">
          <strong>{matchTime(match.scheduled_at)}</strong>
          <span>
            {matchDate(match.scheduled_at)} · {match.court}
          </span>
        </div>
      )}
      <div className="match-info">
        <div className="match-meta">
          <span>{match.category}</span>
          <i>·</i>
          <span>{match.round}</span>
          <b className={finished ? "status finished" : "status"}>
            {finished ? "ĐÃ KẾT THÚC" : "SẮP DIỄN RA"}
          </b>
        </div>
        <div className="teams">
          <span
            className={
              match.score_a !== null && match.score_a > (match.score_b ?? 0)
                ? "winner"
                : ""
            }
          >
            {match.team_a}
          </span>
          <b>{finished ? `${match.score_a} – ${match.score_b}` : "VS"}</b>
          <span
            className={
              match.score_b !== null && match.score_b > (match.score_a ?? 0)
                ? "winner"
                : ""
            }
          >
            {match.team_b}
          </span>
        </div>
        <div className="match-referee">
          TRỌNG TÀI <b>{match.referee || "Đang phân công"}</b>
        </div>
      </div>
      {!schedule && (
        <div className="match-side">
          <span>{matchTime(match.scheduled_at)}</span>
          <small>{match.court}</small>
        </div>
      )}
    </article>
  );
}
