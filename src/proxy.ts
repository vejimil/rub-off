import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LANG, isLang, type Lang } from "./lib/i18n/lang";

// Pages live under /ko, /en and /es. A path without one goes to the visitor's browser language
// (Korean when none of the three is asked for), keeping the rest of the path and the query.
function preferred(request: NextRequest): Lang {
  const header = request.headers.get("accept-language") ?? "";
  const asked = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().slice(0, 2), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return (asked.find((a) => isLang(a.lang))?.lang as Lang | undefined) ?? DEFAULT_LANG;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];
  if (isLang(first)) return;
  const url = request.nextUrl.clone();
  url.pathname = `/${preferred(request)}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Pages only: not the API, Next's files, the sample photos or anything with a file extension.
  matcher: ["/((?!api|_next|samples|.*\\..*).*)"],
};

