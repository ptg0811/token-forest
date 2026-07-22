import { NextResponse } from "next/server";

// Daily digest — RETIRED 2026-07-20. The feature was experimental and has been
// discarded; see docs/superpowers/specs/2026-07-19-daily-digest-design.md for
// what it did and why. The original GET/POST implementation lives in git
// history (the last commit that touched this file before the retirement).
//
// Why 410 instead of deleting the route: installed uploaders do NOT
// auto-update, and packages/uploader/src/digest.mjs probes this endpoint
// BEFORE collecting materials or invoking `claude -p`. A non-2xx answer makes
// an old uploader abort immediately, so it never spends a member's Claude
// quota building a digest the server no longer accepts.
//
// To revive: restore the handlers from git history and flip `digest` back on
// in packages/uploader/src/config.mjs.
function gone() {
  return NextResponse.json({ error: "digest feature retired" }, { status: 410 });
}

export const GET = gone;
export const POST = gone;
