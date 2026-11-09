import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lavita Garden Open 2026 · Thông tin giải đấu",
  description:
    "Đăng ký, theo dõi bảng đấu, lịch thi đấu và kết quả Lavita Garden Open 2026 tại Galaxy Thủ Đức.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
