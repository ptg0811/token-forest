import { NextRequest } from "next/server";
import { renderInstaller } from "./template";

// Always render per-request so the injected origin matches the host that served
// the script (behind a proxy the host/proto only exist on the live request).
export const dynamic = "force-dynamic";

// Reconstruct the public origin from proxy-aware headers, sanitised so nothing
// from the Host header can break out of the shell literal the origin is
// injected into. Restrict host to the characters a real authority can contain.
function resolveOrigin(req: NextRequest): string {
  const rawHost = req.headers.get("host") ?? "";
  const host = /^[A-Za-z0-9.\-:]+$/.test(rawHost) ? rawHost : "localhost:3100";
  const rawProto = (req.headers.get("x-forwarded-proto") ?? "http").split(",")[0].trim();
  const proto = rawProto === "https" ? "https" : "http";
  return `${proto}://${host}`;
}

export function GET(req: NextRequest) {
  const serverUrl = resolveOrigin(req);
  const dashboardUrl = process.env.TOKEN_FOREST_DASHBOARD_URL || serverUrl;
  const backfillStart = process.env.TOKEN_FOREST_BACKFILL_START || "";
  const script = renderInstaller(serverUrl, dashboardUrl, backfillStart);
  return new Response(script, {
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
