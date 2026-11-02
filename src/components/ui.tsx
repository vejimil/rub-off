// Small shared pieces for the app screens: panel, segmented control, underline tabs, pills.
// Framed sheet: panels sit on the bone sheet with a quiet 1px edge, no shadow; colour stays on data.

import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-paper p-5 ${className}`}>{children}</div>;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = "md",
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-well p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`press rounded-full ${size === "sm" ? "px-3 py-1 text-[13px]" : "px-4 py-1.5 text-sm"} ${o.value === value ? "bg-ink text-sand" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Tabs on a 1px rule; the active one carries a 2px ink underline.
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-6 overflow-x-auto border-b border-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`-mb-px flex shrink-0 items-center whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[15px] transition-colors ${o.value === value ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const TONES = {
  chalk: "bg-chalk-soft text-ink",
  mark: "bg-mark-soft text-mark",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
  ink: "bg-ink text-sand",
  muted: "bg-well text-muted",
} as const;

export function Badge({ tone = "muted", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export const buttonPrimary = "press inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2 text-sm font-medium text-sand hover:bg-ink-strong disabled:opacity-40";
export const buttonGhost = "press inline-flex items-center justify-center gap-2 rounded-full border border-line bg-field px-4 py-2 text-sm hover:border-ink disabled:opacity-40";
