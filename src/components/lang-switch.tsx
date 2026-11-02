"use client";

import { usePathname, useRouter } from "next/navigation";
import { LANG_NAME, LANGS, type Lang } from "@/lib/i18n/lang";

// The same page in another language: swap the first path segment, keep the rest and the query.
export function LangSwitch({ lang }: { lang: Lang }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <label className="relative">
      <span className="sr-only">Language</span>
      <select
        value={lang}
        onChange={(e) => {
          const rest = pathname.split("/").slice(2).join("/");
          router.push(`/${e.target.value}${rest ? `/${rest}` : ""}${window.location.search}${window.location.hash}`);
        }}
        className="press cursor-pointer appearance-none rounded-full bg-well py-1.5 pl-3 pr-7 text-[15px] text-ink"
      >
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {LANG_NAME[l]}
          </option>
        ))}
      </select>
      <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
        <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </label>
  );
}
