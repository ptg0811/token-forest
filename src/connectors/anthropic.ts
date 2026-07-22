import type { Connector } from "./types";
import type { UsageRow } from "@/lib/types";

// Claude Code Analytics (Admin) API connector.
// Docs: https://platform.claude.com/docs/en/manage-claude/claude-code-analytics-api
//   GET https://api.anthropic.com/v1/organizations/usage_report/claude_code
//   Auth: header `x-api-key: <ANTHROPIC_ADMIN_KEY>` (an Admin API key, distinct
//   from a standard Claude API key) plus the required `anthropic-version` header.
//   The endpoint returns metrics for a SINGLE UTC day given by `starting_at`
//   (YYYY-MM-DD), one record per user (actor) per day, with a `model_breakdown`
//   array carrying tokens and estimated cost per Claude model.
//
// Cost note: estimated_cost.amount is already denominated in CENTS USD
// (estimated_cost.currency === "USD"), so it maps directly to costEstimateCents.

const API_URL =
  "https://api.anthropic.com/v1/organizations/usage_report/claude_code";
const ANTHROPIC_VERSION = "2023-06-01";
const PAGE_LIMIT = 1000; // max per docs
const DAY_MS = 24 * 60 * 60 * 1000;

interface TokenBreakdown {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_creation?: number;
}

interface ModelBreakdown {
  model?: string;
  tokens?: TokenBreakdown;
  estimated_cost?: { currency?: string; amount?: number };
}

interface Actor {
  type?: string;
  email_address?: string; // user_actor
  api_key_name?: string; // api_actor
}

interface ClaudeCodeRecord {
  date?: string; // RFC 3339 timestamp, e.g. "2025-09-08T00:00:00Z"
  actor?: Actor;
  core_metrics?: { num_sessions?: number };
  model_breakdown?: ModelBreakdown[];
  [key: string]: unknown;
}

interface UsageReportResponse {
  data?: ClaudeCodeRecord[];
  has_more?: boolean;
  next_page?: string | null;
}

function utcDatesSince(since: string): string[] {
  const start = Date.parse(`${since}T00:00:00.000Z`);
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const dates: string[] = [];
  for (let t = start; t <= today; t += DAY_MS) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

// Identify the actor: OAuth users carry an email; API-key actors carry a name.
function actorId(actor: Actor | undefined): string | null {
  return actor?.email_address ?? actor?.api_key_name ?? null;
}

async function fetchDay(
  adminKey: string,
  day: string,
): Promise<ClaudeCodeRecord[]> {
  const records: ClaudeCodeRecord[] = [];
  let page: string | null = null;

  do {
    const url = new URL(API_URL);
    url.searchParams.set("starting_at", day);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (page) url.searchParams.set("page", page);

    const res = await fetch(url, {
      headers: {
        "x-api-key": adminKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Claude Code analytics failed for ${day}: ${res.status} ${res.statusText}${
          body ? ` — ${body}` : ""
        }`,
      );
    }

    const json = (await res.json()) as UsageReportResponse;
    records.push(...(json.data ?? []));
    page = json.has_more ? (json.next_page ?? null) : null;
  } while (page);

  return records;
}

export const anthropicConnector: Connector = {
  tool: "claude_code",
  lookbackDays: 2,

  async fetchDaily(since: string): Promise<UsageRow[]> {
    const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
    if (!adminKey) {
      throw new Error(
        "ANTHROPIC_ADMIN_KEY is not set — required for the Claude Code connector.",
      );
    }

    const rows: UsageRow[] = [];

    // The endpoint reports a single day at a time, so iterate day by day.
    for (const day of utcDatesSince(since)) {
      const records = await fetchDay(adminKey, day);

      for (const record of records) {
        const externalId = actorId(record.actor);
        if (!externalId) continue;

        const date = record.date ? record.date.slice(0, 10) : day;
        const breakdown = record.model_breakdown ?? [];
        const sessions = record.core_metrics?.num_sessions ?? null;

        if (breakdown.length === 0) {
          // No model usage but the actor was active (e.g. sessions only):
          // still record the session count against a blank model.
          if (sessions !== null) {
            rows.push({
              date,
              tool: "claude_code",
              model: "",
              externalId,
              sessions,
              source: "poller",
              raw: record,
            });
          }
          continue;
        }

        breakdown.forEach((mb, i) => {
          rows.push({
            date,
            tool: "claude_code",
            model: mb.model ?? "",
            externalId,
            inputTokens: mb.tokens?.input ?? null,
            outputTokens: mb.tokens?.output ?? null,
            cacheReadTokens: mb.tokens?.cache_read ?? null,
            cacheCreationTokens: mb.tokens?.cache_creation ?? null,
            // num_sessions is a per-user-day metric, not per-model. Attach it
            // to the first model row only so summing across models for a
            // user-day yields the true session count instead of a multiple.
            sessions: i === 0 ? sessions : null,
            // estimated_cost.amount is already in cents USD.
            costEstimateCents: mb.estimated_cost?.amount ?? null,
            source: "poller",
            raw: record,
          });
        });
      }
    }

    return rows;
  },
};
