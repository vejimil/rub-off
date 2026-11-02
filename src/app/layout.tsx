import type { Metadata } from "next";
import { Black_Han_Sans, IBM_Plex_Sans_KR } from "next/font/google";
import Link from "next/link";
import { PageScript } from "@/components/page-script";
import "./globals.css";

// Two faces: a heavy, constructed Korean display face for the few big words, and a grotesk for
// everything else (tabular figures for the measurements).
const display = Black_Han_Sans({ variable: "--font-display-face", weight: "400", subsets: ["latin"], preload: false });
const text = IBM_Plex_Sans_KR({ variable: "--font-text", weight: ["400", "500", "600"], subsets: ["latin"], preload: false });

export const metadata: Metadata = {
  title: "Rub-Off",
  description: "A photo of a garment next to an A4 sheet, turned into a printable sewing pattern, a size decision and a cutting layout.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${display.variable} ${text.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <PageScript />
        <header className="sticky top-0 z-30 bg-sand">
          <div className="flex h-12 w-full items-center gap-6 px-4 sm:px-8">
            <Link href="/" className="flex items-center gap-2 font-display text-lg tracking-tight">
              <Mark />
              Rub-Off
            </Link>
            <nav className="ml-auto flex items-center gap-1 text-[15px]">
              <Link href="/#how" className="link hidden px-3 py-1.5 sm:block">
                방법
              </Link>
              <Link href="/sample" className="link px-3 py-1.5">
                샘플
              </Link>
              <Link href="/make" className="press ml-2 rounded-full bg-ink px-4 py-1.5 font-medium text-sand hover:bg-ink-strong">
                패턴 만들기
              </Link>
            </nav>
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}

// A pattern corner: the cutting line, the seam line 1 cm inside it, and a notch.
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <path d="M3 19 V5 Q3 3 5 3 H19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M7.5 19 V9 Q7.5 7.5 9 7.5 H19" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 2" />
      <path d="M1 12 H6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
