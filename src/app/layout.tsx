import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rub-Off",
  description: "A photo of a garment next to an A4 sheet, turned into a printable sewing pattern, a size decision and a cutting layout.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-5">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <Mark />
              Rub-Off
            </Link>
            <nav className="ml-auto flex items-center gap-1 text-sm">
              <Link href="/sample" className="rounded-full px-3 py-1.5 text-muted hover:text-ink">
                샘플
              </Link>
              <Link href="/make" className="rounded-full bg-ink px-4 py-1.5 text-paper">
                만들기
              </Link>
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-x-6 gap-y-1 px-5 py-6 text-xs text-muted">
            <span>Rub-Off · Meta SAM 3.1 · Muse Spark</span>
            <span>숫자는 모델이 아니라 사진의 기하와 규칙표에서 나옵니다. 재단 전에 확인하십시오.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

// A pattern corner: cutting line, dashed seam line inside it, a notch.
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <path d="M3 19 V5 Q3 3 5 3 H19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M7 19 V8.5 Q7 7 8.5 7 H19" fill="none" stroke="#d9432a" strokeWidth="1.4" strokeDasharray="2 2" />
      <path d="M3 12 H6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
