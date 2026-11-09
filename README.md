# Lavita Garden Open 2026

Website thông tin giải đấu gồm 5 tab: đăng ký trình độ, bảng đấu, lịch thi đấu, xếp hạng và tra cứu lịch vận động viên.

Đăng ký gồm họ tên, số điện thoại tùy chọn và một trong bốn trình độ TBY, TB, TB+ hoặc Khá, kèm mô tả kỹ thuật, di chuyển, thực chiến và thể lực. Giải đấu tổ chức tại Galaxy Thủ Đức ([bản đồ](https://maps.app.goo.gl/hUEdJXFkEhqYrz347)).

## Chạy toàn bộ bằng Docker Compose

```powershell
docker compose up --build
```

Mở http://localhost:3000. Nếu cổng 3000 đang được ứng dụng khác sử dụng, đặt `$env:WEB_PORT = "3001"` trước khi chạy Compose rồi mở http://localhost:3001. API ở http://localhost:8000. SQLite được lưu trong named volume `tournament_data`, nên dữ liệu vẫn còn sau khi container khởi động lại. Dừng các container bằng `docker compose down`; giữ nguyên volume để giữ dữ liệu.

Trang quản trị kết quả ở http://localhost:3000/admin. Trước khi chạy Compose, cấu hình mã quản trị dùng chung cho API và form admin:

```powershell
$env:ADMIN_TOKEN = "your-long-random-admin-token"
docker compose up --build
```

## Chạy local không dùng Docker

Backend (Python 3.10+):

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend (Node.js 18+):

```powershell
cd frontend
npm install
npm run dev
```

Mở http://localhost:3000. API dùng http://localhost:8000 và tự tạo `backend/tournament.db` ở lần chạy đầu. Database bắt đầu không có vận động viên hoặc trận đấu mẫu; các trình độ được tạo sẵn để đăng ký.

## Deploy full-stack lên Vercel

Repo đã có `vercel.json` để triển khai Next.js và FastAPI trong cùng Vercel project bằng Vercel Services. Import repository vào Vercel từ thư mục gốc, sau đó kết nối một Turso database cho các môi trường Production, Preview và Development. Khai báo `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` và `ADMIN_TOKEN` cho service `api`; backend sẽ dùng database SQLite-compatible trên Turso thay cho SQLite file local. Không dùng file SQLite cục bộ làm database production trên Vercel vì filesystem của Functions không đảm bảo lưu dữ liệu lâu dài.

Các bước deploy:

1. Tạo/import Vercel project từ repository, giữ project root ở thư mục gốc để Vercel đọc `vercel.json`.
2. Kết nối Turso từ Vercel Marketplace và cấp `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` cho service API ở Production, Preview và Development.
3. Thêm biến môi trường `ADMIN_TOKEN` cho API service để bật cập nhật kết quả trong `/admin`.
4. Tạo Preview deployment bằng `npx vercel`; sau khi xác nhận cấu hình và dữ liệu, dùng `npx vercel --prod` để triển khai Production.

Vercel Services hiện ở trạng thái Beta. Docker Compose dành cho chạy local; Vercel triển khai các service từ cấu hình `vercel.json`.

## Cấu trúc

- `frontend/`: Next.js App Router, TanStack Query, TypeScript.
- `backend/`: FastAPI và SQLite.
- `docker-compose.yml`: chạy frontend + backend với SQLite volume.
- `vercel.json`: Next.js + FastAPI services và `/api/*` routing trên Vercel.
- Đổi URL API bằng `NEXT_PUBLIC_API_URL` ở frontend.


