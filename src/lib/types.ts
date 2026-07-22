import { z } from "zod";

// The single unified row format. Every ingestion path — server-side pollers,
// the local uploader CLI, manual entry — produces UsageRow[].
// Values are daily totals per (date, tool, model, externalId): upserts replace.
export const usageRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  tool: z.string().min(1),
  model: z.string().default(""),
  // Tool-native user identifier (email, user_id, github username, ...)
  externalId: z.string().min(1),
  // Distinguishes uploads from different machines of the same member so their
  // daily totals add instead of overwriting. "" for server-side pollers.
  machineId: z.string().max(64).optional(),
  inputTokens: z.number().int().nonnegative().nullish(),
  outputTokens: z.number().int().nonnegative().nullish(),
  cacheReadTokens: z.number().int().nonnegative().nullish(),
  cacheCreationTokens: z.number().int().nonnegative().nullish(),
  requests: z.number().int().nonnegative().nullish(),
  sessions: z.number().int().nonnegative().nullish(),
  costEstimateCents: z.number().nonnegative().nullish(),
  source: z.enum(["poller", "uploader", "manual"]),
  raw: z.unknown().optional(),
});

export type UsageRow = z.infer<typeof usageRowSchema>;

// Hour-grained rows for the additive usage_hourly collection. Same shape as a
// usage row minus daily-only fields, keyed by an hour string instead of date.
export const usageHourlyRowSchema = z.object({
  hour: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}$/, "hour must be YYYY-MM-DDTHH"),
  tool: z.string().min(1),
  model: z.string().default(""),
  externalId: z.string().min(1),
  machineId: z.string().max(64).optional(),
  inputTokens: z.number().int().nonnegative().nullish(),
  outputTokens: z.number().int().nonnegative().nullish(),
  cacheReadTokens: z.number().int().nonnegative().nullish(),
  cacheCreationTokens: z.number().int().nonnegative().nullish(),
  requests: z.number().int().nonnegative().nullish(),
  source: z.enum(["poller", "uploader", "manual"]),
});

export type UsageHourlyRow = z.infer<typeof usageHourlyRowSchema>;

// Ingest callers are authenticated as a member; externalId is always derived
// from that member (a supplied value is ignored — see the ingest route).
// `hourly` rows are optional and feed usage_hourly (heatmap only).
export const ingestPayloadSchema = z.object({
  rows: z
    .array(usageRowSchema.extend({ externalId: z.string().optional() }))
    .min(1)
    .max(10_000),
  hourly: z
    .array(usageHourlyRowSchema.extend({ externalId: z.string().optional() }))
    .max(20_000)
    .optional(),
});

// Plan-limit snapshot for one Claude account window. Posted to /api/limits by
// the uploader; the member is the authenticated caller.
export const limitSnapshotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  accountEmail: z.string().min(1),
  // One email can hold several plans (personal Max + Team seat); the login's
  // organization tells them apart. "" for uploaders predating this field.
  organization: z.string().optional(),
  window: z.string().min(1),
  utilizationPct: z.number().nonnegative(),
  subscriptionType: z.string().nullish(),
  rateLimitTier: z.string().nullish(),
  resetsAt: z.string().nullish(),
  raw: z.unknown().optional(),
});

export type LimitSnapshotInput = z.infer<typeof limitSnapshotSchema>;

export const limitsPayloadSchema = z.object({
  snapshots: z.array(limitSnapshotSchema).min(1).max(200),
});

// Daily digest draft posted to /api/digest by the uploader. The member is the
// authenticated caller; the server only accepts it while the document is still
// an unedited draft (human edits/resolutions are immutable to the uploader).
export const digestPayloadSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  content: z.string().min(1).max(4000),
  materials: z.string().max(8000).default(""),
  touchedFiles: z
    .array(
      z.object({
        repo: z.string().min(1).max(200),
        files: z.array(z.string().max(500)).max(100),
      }),
    )
    .max(20)
    .default([]),
  // Machines whose material is included (multi-machine merge bookkeeping).
  machines: z.array(z.string().min(1).max(64)).max(8).default([]),
});
export type DigestPayload = z.infer<typeof digestPayloadSchema>;
