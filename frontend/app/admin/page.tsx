"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, AdminOverview, Match } from "@/lib/api";

const matchLabel = (match: Match) =>
  `${match.category} · ${match.group_name || match.round} · ${match.team_a} vs ${match.team_b}`;

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "players" | "results" | "analysis" | "settings"
  >("players");
  const [selectedId, setSelectedId] = useState("");
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const overview = useQuery<AdminOverview>({
    queryKey: ["admin-overview"],
    queryFn: adminApi.overview,
    enabled: authenticated,
    retry: false,
  });
  const standings = useQuery({
    queryKey: ["admin-standings"],
    queryFn: async () => {
      const ids =
        overview.data?.categories.map((category) => category.id) ?? [];
      const values = await Promise.all(ids.map((id) => adminApi.standings(id)));
      return values.flat();
    },
    enabled: Boolean(overview.data),
  });

  useEffect(() => {
    if (adminApi.hasSession()) setAuthenticated(true);
    if (overview.data) setAuthenticated(true);
    if (overview.isError) {
      setAuthenticated(false);
      adminApi.clearSession();
      setError(overview.error.message);
    }
  }, [overview.data, overview.error, overview.isError]);

  const selectedMatch = overview.data?.matches.find(
    (match) => match.id === Number(selectedId),
  );
  const tied =
    scoreA !== "" && scoreB !== "" && Number(scoreA) === Number(scoreB);
  const groups = useMemo(() => {
    const map = new Map<string, AdminOverview["players"]>();
    for (const player of overview.data?.players ?? []) {
      const group = player.group_name || "Chưa xếp nhóm";
      map.set(group, [...(map.get(group) ?? []), player]);
    }
    return [...map.entries()];
  }, [overview.data?.players]);

  const login = useMutation({
    mutationFn: () => adminApi.login(token),
    onSuccess: (session) => {
      adminApi.saveSession(session);
      setToken("");
      setError("");
      setAuthenticated(true);
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (reason: Error) => setError(reason.message),
  });
  const updateResult = useMutation({
    mutationFn: () =>
      adminApi.updateMatchResult(
        Number(selectedId),
        Number(scoreA),
        Number(scoreB),
      ),
    onSuccess: async (result) => {
      setNotice(result.message);
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-standings"] });
    },
    onError: (reason: Error) => setError(reason.message),
  });
  const updatePlayer = useMutation({
    mutationFn: ({
      id,
      group,
      category,
    }: {
      id: number;
      group: string;
      category: number;
    }) => adminApi.assignPlayer(id, group, category),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] }),
    onError: (reason: Error) => setError(reason.message),
  });
  const updateSetting = useMutation({
    mutationFn: ({
      name,
      enabled,
    }: {
      name: "registrations" | "results";
      enabled: boolean;
    }) => adminApi.setting(name, enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["matches"] });
      setNotice("Đã cập nhật trạng thái giải đấu.");
    },
    onError: (reason: Error) => setError(reason.message),
  });

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate();
  }

  function submitResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || tied) return;
    updateResult.mutate();
  }

  function logout() {
    adminApi.clearSession();
    setAuthenticated(false);
    queryClient.removeQueries({ queryKey: ["admin-overview"] });
  }

  return (
    <main className="admin-page">
      <header className="masthead">
        <a className="brand" href="/" aria-label="Lavita Garden Open 2026">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" role="img">
              <path d="M24 5 8 38h7l9-19 9 19h7L24 5Z" />
              <path d="m14 31 20 1m-17-8 14 1m-11-8 8 1" />
            </svg>
          </span>
          <span>
            <small>TRANG QUẢN TRỊ</small>
            <strong>LAVITA GARDEN OPEN 2026</strong>
          </span>
        </a>
        <div className="admin-header-actions">
          <a className="admin-back-link" href="/">
            ← Về trang giải đấu
          </a>
          {authenticated && (
            <button className="admin-logout" onClick={logout}>
              Đăng xuất
            </button>
          )}
        </div>
      </header>

      {!authenticated ? (
        <section className="admin-content">
          <div className="section-tag">
            <span>ĐĂNG NHẬP QUẢN TRỊ</span>
            <div />
          </div>
          <div className="admin-card">
            <span className="eyebrow">PHIÊN QUẢN TRỊ 6 GIỜ</span>
            <h1>Đăng nhập trang quản trị.</h1>
            <p className="admin-description">
              Nhập admin token để bắt đầu. Phiên sẽ được tự động làm mới khi
              cần.
            </p>
            <form onSubmit={submitLogin}>
              <label className="admin-field">
                Admin token
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="Nhập admin token"
                />
              </label>
              {error && (
                <p className="form-status error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button yellow submit"
                type="submit"
                disabled={login.isPending}
              >
                {login.isPending ? "Đang đăng nhập…" : "Đăng nhập"}
                <span>↗</span>
              </button>
            </form>
          </div>
        </section>
      ) : (
        <section className="admin-content admin-dashboard">
          <div className="section-tag">
            <span>BẢNG ĐIỀU KHIỂN</span>
            <div />
          </div>
          <nav className="admin-tabs" aria-label="Các chức năng quản trị">
            {[
              ["players", "Vận động viên"],
              ["results", "Nhập kết quả"],
              ["analysis", "Phân tích"],
              ["settings", "Điều hành"],
            ].map(([tab, label]) => (
              <button
                className={activeTab === tab ? "active" : ""}
                key={tab}
                onClick={() => setActiveTab(tab as typeof activeTab)}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>
          {error && (
            <p className="form-status error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="form-status success" role="status">
              {notice}
            </p>
          )}
          {overview.isLoading && (
            <p className="muted">Đang tải dữ liệu giải đấu…</p>
          )}
          {overview.data && (
            <>
              {activeTab === "settings" && (
                <section className="admin-card admin-controls">
                  <span className="eyebrow">TRẠNG THÁI GIẢI ĐẤU</span>
                  <h1>Điều hành giải đấu.</h1>
                  <div className="admin-toggle-row">
                    <div>
                      <strong>Đăng ký vận động viên</strong>
                      <small>
                        {overview.data.settings.registrations_open
                          ? "Form đang mở"
                          : "Form đã đóng"}
                      </small>
                    </div>
                    <button
                      className={`admin-toggle ${overview.data.settings.registrations_open ? "is-on" : ""}`}
                      onClick={() =>
                        updateSetting.mutate({
                          name: "registrations",
                          enabled: !overview.data!.settings.registrations_open,
                        })
                      }
                    >
                      {overview.data.settings.registrations_open
                        ? "Đóng đăng ký"
                        : "Mở đăng ký"}
                    </button>
                  </div>
                  <div className="admin-toggle-row">
                    <div>
                      <strong>Công bố kết quả</strong>
                      <small>
                        {overview.data.settings.results_published
                          ? "Kết quả đang hiển thị công khai"
                          : "Kết quả đang ẩn"}
                      </small>
                    </div>
                    <button
                      className={`admin-toggle ${overview.data.settings.results_published ? "is-on" : ""}`}
                      onClick={() =>
                        updateSetting.mutate({
                          name: "results",
                          enabled: !overview.data!.settings.results_published,
                        })
                      }
                    >
                      {overview.data.settings.results_published
                        ? "Ẩn kết quả"
                        : "Công bố kết quả"}
                    </button>
                  </div>
                </section>
              )}

              {activeTab === "players" && (
                <section className="admin-card admin-wide-card">
                  <span className="eyebrow">VẬN ĐỘNG VIÊN & NHÓM</span>
                  <h2>Phân nhóm thi đấu.</h2>
                  <p className="admin-description">
                    {overview.data.players.length} vận động viên ·{" "}
                    {groups.length} nhóm
                  </p>
                  {groups.map(([groupName, players]) => (
                    <div className="admin-player-group" key={groupName}>
                      <h3>{groupName}</h3>
                      {players.map((player) => (
                        <div className="admin-player-row" key={player.id}>
                          <div>
                            <strong>{player.name}</strong>
                            <small>
                              {player.phone || "Chưa có số điện thoại"}
                            </small>
                          </div>
                          <label>
                            Trình độ
                            <select
                              value={player.category_id}
                              onChange={(event) =>
                                updatePlayer.mutate({
                                  id: player.id,
                                  group: player.group_name,
                                  category: Number(event.target.value),
                                })
                              }
                            >
                              {overview.data!.categories.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Nhóm
                            <input
                              aria-label={`Nhóm của ${player.name}`}
                              defaultValue={player.group_name}
                              placeholder="Ví dụ: A"
                              onBlur={(event) => {
                                if (event.target.value !== player.group_name)
                                  updatePlayer.mutate({
                                    id: player.id,
                                    group: event.target.value,
                                    category: player.category_id,
                                  });
                              }}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
              )}

              {activeTab === "results" && (
                <section className="admin-card admin-wide-card">
                  <span className="eyebrow">CẬP NHẬT TỶ SỐ</span>
                  <h2>Nhập kết quả cặp đấu.</h2>
                  <form onSubmit={submitResult}>
                    <label className="admin-field">
                      Chọn trận đấu
                      <select
                        required
                        value={selectedId}
                        onChange={(event) => {
                          setSelectedId(event.target.value);
                          const match = overview.data!.matches.find(
                            (item) => item.id === Number(event.target.value),
                          );
                          setScoreA(match?.score_a?.toString() ?? "");
                          setScoreB(match?.score_b?.toString() ?? "");
                        }}
                      >
                        <option value="">Chọn cặp thi đấu</option>
                        {overview.data.matches.map((match) => (
                          <option value={match.id} key={match.id}>
                            {matchLabel(match)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedMatch && (
                      <div className="admin-score-grid">
                        <label className="admin-field">
                          {selectedMatch.team_a}
                          <input
                            type="number"
                            min="0"
                            max="30"
                            required
                            value={scoreA}
                            onChange={(event) => setScoreA(event.target.value)}
                          />
                        </label>
                        <span className="admin-score-separator">–</span>
                        <label className="admin-field">
                          {selectedMatch.team_b}
                          <input
                            type="number"
                            min="0"
                            max="30"
                            required
                            value={scoreB}
                            onChange={(event) => setScoreB(event.target.value)}
                          />
                        </label>
                      </div>
                    )}
                    {tied && (
                      <p className="form-status error">
                        Trận đấu không có kết quả hòa.
                      </p>
                    )}
                    <button
                      className="button yellow submit"
                      type="submit"
                      disabled={
                        !selectedMatch || tied || updateResult.isPending
                      }
                    >
                      {updateResult.isPending ? "Đang lưu…" : "Lưu kết quả"}
                      <span>↗</span>
                    </button>
                  </form>
                </section>
              )}

              {activeTab === "analysis" && (
                <section className="admin-card admin-wide-card">
                  <span className="eyebrow">PHÂN TÍCH THI ĐẤU</span>
                  <h2>Bảng xếp hạng các bảng.</h2>
                  {standings.data?.length ? (
                    <div className="admin-standings-grid">
                      {standings.data.map((group) => (
                        <div
                          className="admin-standing-group"
                          key={group.group_name}
                        >
                          <h3>{group.group_name}</h3>
                          {group.rows.map((row) => (
                            <div className="admin-standing-row" key={row.pair}>
                              <b>{row.rank}</b>
                              <strong>{row.pair}</strong>
                              <span>{row.played} trận</span>
                              <span>{row.wins} thắng</span>
                              <span>{row.points} điểm</span>
                              <span>
                                Hiệu số {row.score_diff > 0 ? "+" : ""}
                                {row.score_diff}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">
                      Chưa có bảng đấu hoặc chưa có kết quả để phân tích.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
