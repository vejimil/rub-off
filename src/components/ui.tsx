// Small shared pieces: card, segmented control, badges. Pattern-paper palette from globals.css.

import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(29,29,27,0.04)] ${className}`}>{children}</div>;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-full border border-line bg-paper p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-full ${size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm"} transition ${
            o.value === value ? "bg-ink text-paper shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const TONES = {
  chalk: "bg-chalk-soft text-chalk",
  mark: "bg-mark-soft text-mark",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
  ink: "bg-ink text-paper",
  muted: "bg-paper text-muted ring-1 ring-line",
} as const;

export function Badge({ tone = "muted", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>{children}</span>;
}

export function StepTitle({ n, title, sub }: { n: number; title: string; sub?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-paper">{n}</span>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
    </div>
  );
}

export const buttonPrimary = "inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-black disabled:opacity-40";
export const buttonGhost = "inline-flex items-center justify-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm transition hover:border-ink disabled:opacity-40";
