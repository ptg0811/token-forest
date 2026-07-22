import type { Connector } from "./types";
import type { UsageHourlyRow, UsageRow } from "@/lib/types";

// OpenAI organization Usage API (Completions).
// Docs:
//   https://developers.openai.com/cookbook/examples/completions_usage_api
//   https://developers.openai.com/api/reference
//
// GET /v1/organization/usage/completions returns usage aggregated into
// time buckets. With bucket_width=1d each bucket is one UTC day; grouping by
// user_id + model gives us one result per (day, user, model). Array params are
// passed as repeated query keys (group_by=user_id&group_by=model), matching the
// Python `requests` list encoding the cookbook uses. Pagination is cursor-based:
// the response carries a `next_page` string that is fed back as the `page` param
// until it is null.

const USAGE_URL = "https://api.openai.com/v1/organization/usage/completions";

// Max buckets the endpoint returns per page for 1d width. We still follow
// next_page, so this only bounds the number of round-trips.
const BUCKET_LIMIT = 31;

// For 1h width the endpoint caps a single query at 168 buckets (7 days). We
// both request that page size AND chunk the [since, now] range into 7-day
// windows, so no window can exceed the cap even before next_page paging.
const HOUR_BUCKET_LIMIT = 168;
const HOUR_WINDOW_SECONDS = 7 * 24 * 60 * 60;

interface CompletionsResult {
  object: string;
  input_tokens?: number | null;
  output_tokens?: number | null;
  input_cached_tokens?: number | null;
  input_audio_tokens?: number | null;
  output_audio_tokens?: number | null;
  num_model_requests?: number | null;
  project_id?: string | null;
  user_id?: string | null;
  api_key_id?: string | null;
  model?: string | null;
  batch?: boolean | null;
}

interface UsageBucket {
  object: string;
  start_time: number;
  end_time: number;
  results: CompletionsResult[];
}

interface UsagePage {
  data: UsageBucket[];
  next_page: string | null;
}

// Service/product projects whose API-key traffic must not count as member
// usage. API-key calls are attributed to the key creator's user_id, so without
// this filter a service key silently inflates one member's numbers.
function excludedProjects(): Set<string> {
  return new Set(
    (process.env.OPENAI_EXCLUDE_PROJECTS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

// Grouping by project_id (needed for the exclusion) splits a (bucket, user,
// model) total across projects; merge the surviving results back so one row
// per upsert key comes out. `raw` keeps the per-project results for debugging.
interface MergedAgg {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  requests: number;
  raw: CompletionsResult[];
}

function mergeResult(
  map: Map<string, MergedAgg>,
  key: string,
  result: CompletionsResult,
): void {
  let agg = map.get(key);
  if (!agg) {
    agg = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, requests: 0, raw: [] };
    map.set(key, agg);
  }
  agg.inputTokens += result.input_tokens ?? 0;
  agg.outputTokens += result.output_tokens ?? 0;
  agg.cacheReadTokens += result.input_cached_tokens ?? 0;
  agg.requests += result.num_model_requests ?? 0;
  agg.raw.push(result);
}

// UTC unix seconds at midnight of a YYYY-MM-DD day.
function unixDayStart(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
}

// A bucket's UTC calendar day, from its start_time.
function bucketDate(startTime: number): string {
  return new Date(startTime * 1000).toISOString().slice(0, 10);
}

// A bucket's UTC hour ("YYYY-MM-DDTHH"), from its start_time.
function bucketHour(startTime: number): string {
  return new Date(startTime * 1000).toISOString().slice(0, 13);
}

async function fetchDaily(since: string): Promise<UsageRow[]> {
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  if (!adminKey) {
    throw new Error(
      "OPENAI_ADMIN_KEY env var is not set (required for the OpenAI usage connector)",
    );
  }

  const headers = {
    Authorization: `Bearer ${adminKey}`,
    "Content-Type": "application/json",
  };

  const excluded = excludedProjects();
  const merged = new Map<string, MergedAgg>();
  let page: string | null = null;

  do {
    const params = new URLSearchParams();
    params.set("start_time", String(unixDayStart(since)));
    params.set("bucket_width", "1d");
    params.set("limit", String(BUCKET_LIMIT));
    // Repeated keys — the API reads group_by as an array. project_id is only
    // needed to apply the exclusion; rows are re-merged across projects below.
    params.append("group_by", "user_id");
    params.append("group_by", "model");
    params.append("group_by", "project_id");
    if (page) params.set("page", page);

    const res = await fetch(`${USAGE_URL}?${params.toString()}`, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `OpenAI usage API request failed: ${res.status} ${res.statusText}${
          body ? ` — ${body}` : ""
        }`,
      );
    }

    const json = (await res.json()) as UsagePage;

    for (const bucket of json.data ?? []) {
      const date = bucketDate(bucket.start_time);
      for (const result of bucket.results ?? []) {
        // Usage without an attributable user cannot be mapped to a member.
        if (!result.user_id) continue;
        if (result.project_id && excluded.has(result.project_id)) continue;
        mergeResult(
          merged,
          JSON.stringify([date, result.user_id, result.model ?? ""]),
          result,
        );
      }
    }

    page = json.next_page ?? null;
  } while (page);

  return [...merged.entries()].map(([key, agg]) => {
    const [date, userId, model] = JSON.parse(key) as [string, string, string];
    return {
      date,
      tool: "openai",
      model,
      externalId: userId,
      inputTokens: agg.inputTokens,
      outputTokens: agg.outputTokens,
      cacheReadTokens: agg.cacheReadTokens,
      cacheCreationTokens: null,
      requests: agg.requests,
      source: "poller" as const,
      raw: agg.raw,
    };
  });
}

// Hour-grained mirror of fetchDaily for usage_hourly. Same completions
// endpoint and grouping, but bucket_width=1h. Because 1h buckets are capped at
// 168 per query, the [since, now] range is walked in 7-day windows, each paged
// via next_page (a window with >168 non-empty buckets is impossible, but the
// cursor is followed anyway to match the daily path).
async function fetchHourly(since: string): Promise<UsageHourlyRow[]> {
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  if (!adminKey) {
    throw new Error(
      "OPENAI_ADMIN_KEY env var is not set (required for the OpenAI usage connector)",
    );
  }

  const headers = {
    Authorization: `Bearer ${adminKey}`,
    "Content-Type": "application/json",
  };

  const excluded = excludedProjects();
  const merged = new Map<string, MergedAgg>();
  const nowSec = Math.floor(Date.now() / 1000);

  for (
    let winStart = unixDayStart(since);
    winStart < nowSec;
    winStart += HOUR_WINDOW_SECONDS
  ) {
    const winEnd = Math.min(winStart + HOUR_WINDOW_SECONDS, nowSec);
    let page: string | null = null;

    do {
      const params = new URLSearchParams();
      params.set("start_time", String(winStart));
      params.set("end_time", String(winEnd));
      params.set("bucket_width", "1h");
      params.set("limit", String(HOUR_BUCKET_LIMIT));
      params.append("group_by", "user_id");
      params.append("group_by", "model");
      params.append("group_by", "project_id");
      if (page) params.set("page", page);

      const res = await fetch(`${USAGE_URL}?${params.toString()}`, { headers });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `OpenAI usage API request failed: ${res.status} ${res.statusText}${
            body ? ` — ${body}` : ""
          }`,
        );
      }

      const json = (await res.json()) as UsagePage;

      for (const bucket of json.data ?? []) {
        const hour = bucketHour(bucket.start_time);
        for (const result of bucket.results ?? []) {
          if (!result.user_id) continue;
          if (result.project_id && excluded.has(result.project_id)) continue;
          mergeResult(
            merged,
            JSON.stringify([hour, result.user_id, result.model ?? ""]),
            result,
          );
        }
      }

      page = json.next_page ?? null;
    } while (page);
  }

  return [...merged.entries()].map(([key, agg]) => {
    const [hour, userId, model] = JSON.parse(key) as [string, string, string];
    return {
      hour,
      tool: "openai",
      model,
      externalId: userId,
      inputTokens: agg.inputTokens,
      outputTokens: agg.outputTokens,
      cacheReadTokens: agg.cacheReadTokens,
      cacheCreationTokens: null,
      requests: agg.requests,
      source: "poller" as const,
    };
  });
}

export const openaiConnector: Connector = {
  tool: "openai",
  fetchDaily,
  fetchHourly,
};
