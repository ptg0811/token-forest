import { NextRequest, NextResponse } from "next/server";

// Public-ingest path allowlist. When INGEST_HOST is set (e.g.
// ingest.example.com), requests arriving under that host may reach only the
// five public endpoints — everything else (dashboard pages, other APIs) is
// rejected before rendering. Requests under any other host (the internal
// dashboard fronting) are untouched. Unset INGEST_HOST disables the gate.
const PUBLIC_PATHS = [
  "/api/ingest",
  "/api/limits",
  "/install.sh",
  "/uploader.tgz",
  "/api/me/summary",
];

export function middleware(req: NextRequest) {
  const ingestHost = process.env.INGEST_HOST;
  if (!ingestHost) return NextResponse.next();
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (host !== ingestHost.toLowerCase()) return NextResponse.next();
  const path = req.nextUrl.pathname;
  if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  return new NextResponse("Forbidden", { status: 403 });
}
