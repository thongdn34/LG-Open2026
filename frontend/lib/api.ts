export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type Category = {
  id: number;
  name: string;
  description: string;
  technique_description: string;
  matchplay_description: string;
};

export const TOURNAMENT_CATEGORIES: Category[] = [
  {
    id: 1,
    name: "TBY",
    description: "Trung bình yếu",
    technique_description:
      "Nắm luật cơ bản nhưng thao tác còn lóng ngóng. Phông cầu chưa tới cuối sân; bỏ nhỏ và đập cầu còn thiếu lực, cầu chưa cắm. Di chuyển bị động, thường chạy theo cầu.",
    matchplay_description:
      "Dễ mất kiểm soát và hay hỏng các quả cầu đơn giản. Thể lực nhanh đuối khi lượt cầu kéo dài qua 2–3 nhịp.",
  },
  {
    id: 2,
    name: "TB",
    description: "Trung bình chuẩn",
    technique_description:
      "Nắm vững kỹ thuật cơ bản: phông sâu gần hết sân, phát cầu ổn định, biết chém và bỏ nhỏ. Bắt đầu điều cầu, tìm khoảng trống để đưa cầu đi.",
    matchplay_description:
      "Lối chơi ổn định, phán đoán hướng cầu khá tốt. Biết phối hợp vị trí khi đánh đôi, phân biệt tương đối rõ tấn công và phòng thủ.",
  },
  {
    id: 3,
    name: "TB+",
    description: "Trung bình cộng / Trung bình khá",
    technique_description:
      "Kỹ thuật cơ bản thành thạo khoảng 70–80%; xử lý nhanh các tình huống phản tạt, kê cầu và đập cầu uy lực hơn. Di chuyển chủ động cả bốn góc sân.",
    matchplay_description:
      "Biết đọc trận đấu, phân phối sức và phòng thủ nhiều hướng. Nhịp độ thi đấu nhanh, ít mắc lỗi tự đánh hỏng.",
  },
  {
    id: 4,
    name: "Khá",
    description: "Trình độ khá",
    technique_description:
      "Kỹ thuật toàn diện, đường cầu sắc bén và có tư duy chiến thuật rõ ràng. Thực hiện thuần thục các tình huống khó bằng cả tay thuận lẫn trái tay.",
    matchplay_description:
      "Xử lý nhạy bén dưới áp lực cao, phản xạ nhanh. Thể lực tốt, có thể làm chủ thế trận trước đối thủ ở trình độ thấp hơn.",
  },
];



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

const ACCESS_KEY = "lavita_admin_access";
const REFRESH_KEY = "lavita_admin_refresh";

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (typeof window === "undefined")
    throw new Error("Trang quản trị chỉ khả dụng trên trình duyệt.");
  let access = window.sessionStorage.getItem(ACCESS_KEY) ?? "";
  const send = (token: string) =>
    request<T>(path, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    });
  try {
    return await send(access);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("Phiên quản trị hết hạn")
    )
      throw error;
    const refresh = window.localStorage.getItem(REFRESH_KEY);
    if (!refresh) throw error;
    const session = await request<{
      access_token: string;
      refresh_token: string;
    }>("/api/admin/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refresh }),
    });
    access = session.access_token;
    window.sessionStorage.setItem(ACCESS_KEY, access);
    window.localStorage.setItem(REFRESH_KEY, session.refresh_token);
    return send(access);
  }
}

export type AdminOverview = {
  players: (Player & {
    phone: string | null;
    category_id: number;
    group_name: string;
  })[];
  settings: { registrations_open: boolean; results_published: boolean };
  matches: Match[];
  categories: { id: number; name: string }[];
};

export const adminApi = {
  hasSession: () =>
    typeof window !== "undefined" &&
    Boolean(
      window.sessionStorage.getItem(ACCESS_KEY) ||
      window.localStorage.getItem(REFRESH_KEY),
    ),
  login: (token: string) =>
    request<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>("/api/admin/session", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  overview: () => adminRequest<AdminOverview>("/api/admin/overview"),
  standings: (categoryId: number) =>
    adminRequest<StandingGroup[]>(`/api/admin/standings/${categoryId}`),
  assignPlayer: (id: number, group_name: string, category_id: number) =>
    adminRequest<{ message: string }>(`/api/admin/players/${id}`, {
      method: "PUT",
      body: JSON.stringify({ group_name, category_id }),
    }),
  setting: (name: "registrations" | "results", enabled: boolean) =>
    adminRequest<{ message: string }>(`/api/admin/settings/${name}`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),
  updateMatchResult: (matchId: number, score_a: number, score_b: number) =>
    adminRequest<{ message: string; updated_at: string }>(
      `/api/admin/matches/${matchId}/result`,
      {
        method: "PUT",
        body: JSON.stringify({ score_a, score_b }),
      },
    ),
  clearSession: () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(ACCESS_KEY);
      window.localStorage.removeItem(REFRESH_KEY);
    }
  },
  saveSession: (session: { access_token: string; refresh_token: string }) => {
    window.sessionStorage.setItem(ACCESS_KEY, session.access_token);
    window.localStorage.setItem(REFRESH_KEY, session.refresh_token);
  },
};

export const api = {
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
  ) => adminApi.updateMatchResult(matchId, payload.score_a, payload.score_b),
};
