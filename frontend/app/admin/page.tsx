"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Match } from "@/lib/api";

const matchLabel = (match: Match) =>
  `${match.category} · ${match.group_name || match.round} · ${match.team_a} vs ${match.team_b}`;

export default function AdminPage() {
  const queryClient = useQueryClient();
  const matches = useQuery({ queryKey: ["matches"], queryFn: api.matches });
  const [selectedId, setSelectedId] = useState("");
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [token, setToken] = useState("");
  const selectedMatch = matches.data?.find(
    (match) => match.id === Number(selectedId),
  );
  const scoresAreTied =
    scoreA !== "" && scoreB !== "" && Number(scoreA) === Number(scoreB);
  const updateResult = useMutation({
    mutationFn: ({
      matchId,
      payload,
    }: {
      matchId: number;
      payload: { score_a: number; score_b: number; token: string };
    }) => api.updateMatchResult(matchId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });

  useEffect(() => {
    if (!selectedMatch) {
      return;
    }
    setScoreA(selectedMatch.score_a?.toString() ?? "");
    setScoreB(selectedMatch.score_b?.toString() ?? "");
  }, [selectedMatch]);

  function submitResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) {
      return;
    }
    if (scoresAreTied) {
      return;
    }
    updateResult.mutate({
      matchId: Number(selectedId),
      payload: {
        score_a: Number(scoreA),
        score_b: Number(scoreB),
        token,
      },
    });
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
        <a className="admin-back-link" href="/">
          ← Về trang giải đấu
        </a>
      </header>

      <section className="admin-content">
        <div className="section-tag">
          <span>QUẢN LÝ TRẬN ĐẤU</span>
          <div />
        </div>
        <div className="admin-card">
          <span className="eyebrow">CẬP NHẬT TỶ SỐ</span>
          <h1>Nhập kết quả trận đấu.</h1>
          <p className="admin-description">
            Sau khi lưu, kết quả và bảng xếp hạng sẽ được cập nhật. Khán giả
            đang xem trang giải đấu sẽ nhận được thông báo.
          </p>
          <form onSubmit={submitResult}>
            <label className="admin-field">
              Chọn trận đấu
              <select
                required
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                <option value="">Chọn cặp thi đấu</option>
                {(matches.data ?? []).map((match) => (
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

            {scoresAreTied && (
              <p className="form-status error" role="alert">
                Trận đấu không có kết quả hòa. Vui lòng nhập tỷ số có đội thắng.
              </p>
            )}

            <label className="admin-field">
              Mã quản trị
              <input
                type="password"
                autoComplete="current-password"
                required
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Nhập ADMIN_TOKEN"
              />
            </label>

            {matches.isError && (
              <p className="form-status error" role="alert">
                {matches.error.message}
              </p>
            )}
            {updateResult.isSuccess && (
              <p className="form-status success" role="status">
                {updateResult.data.message}
              </p>
            )}
            {updateResult.isError && (
              <p className="form-status error" role="alert">
                {updateResult.error.message}
              </p>
            )}

            <button
              className="button yellow submit"
              type="submit"
              disabled={
                !selectedMatch || scoresAreTied || updateResult.isPending
              }
            >
              {updateResult.isPending ? "Đang cập nhật…" : "Cập nhật kết quả"}
              <span>↗</span>
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
