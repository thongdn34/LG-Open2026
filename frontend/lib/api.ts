export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type Category = {
  id: number;
  name: string;
  description: string;
  technique_description: string;
  matchplay_description: string;
};
export type Match = {
  id: number;
  category: string;
  round: string;
  court: string;
  scheduled_at: string;
  status: string;
  team_a: string;
  team_b: string;
  score_a: number | null;
  score_b: number | null;
  referee: string;
  group_name: string;
  result_updated_at: string | null;
};
export type Standing = {
  rank: number;
  pair: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
  score_diff: number;
};
export type StandingGroup = { group_name: string; rows: Standing[] };
export type Player = {
  id: number;
  name: string;
  category: string;
};
export type PlayerSchedule = { player: Player; matches: Match[] };
export type TournamentStats = { registered_players: number; matches: number };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const localApiUrl =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? "http://localhost:8000"
      : "";
  const response = await fetch(`${API_URL || localApiUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.detail ?? "Không thể kết nối máy chủ. Vui lòng thử lại.",
    );
  }
  return response.json();
}

export const api = {
  categories: () => request<Category[]>("/api/categories"),
  stats: () => request<TournamentStats>("/api/stats"),
  matches: () => request<Match[]>("/api/matches"),
  standings: (categoryId: number) =>
    request<StandingGroup[]>(`/api/standings?category_id=${categoryId}`),
  players: (search: string) =>
    request<Player[]>(`/api/players?search=${encodeURIComponent(search)}`),
  playerSchedule: (id: number) =>
    request<PlayerSchedule>(`/api/players/${id}/schedule`),
  register: (payload: {
    name: string;
    phone: string | null;
    category_id: number;
  }) =>
    request<{ message: string }>("/api/registrations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateMatchResult: (
    matchId: number,
    payload: { score_a: number; score_b: number; token: string },
  ) =>
    request<{ message: string; updated_at: string }>(
      `/api/admin/matches/${matchId}/result`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${payload.token}` },
        body: JSON.stringify({
          score_a: payload.score_a,
          score_b: payload.score_b,
        }),
      },
    ),
};
