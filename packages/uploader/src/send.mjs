// POST aggregated rows to {serverUrl}/api/ingest with a per-member bearer token.
// The endpoint caps a request at 10000 rows, so batch larger payloads.

const MAX_ROWS_PER_REQUEST = 10_000;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Send all rows, batching as needed. Optional `hourly` rows (usage_hourly
// mirror) ride along with the FIRST batch only — every payload must carry >=1
// daily row (the ingest schema requires it), and hourly is derived from the
// same entries as `rows`, so `rows` is empty exactly when `hourly` is. Sending
// hourly once avoids duplicating it across batches (upserts would dedup it, but
// re-sending is wasted payload). Returns { batches, upserted, skipped,
// hourlyUpserted }. Throws on any non-2xx response.
export async function sendRows({ serverUrl, token, rows, hourly }) {
  const batches = chunk(rows, MAX_ROWS_PER_REQUEST);
  let upserted = 0;
  let skipped = 0;
  let hourlyUpserted = 0;
  for (let i = 0; i < batches.length; i++) {
    const body = { rows: batches[i] };
    if (i === 0 && hourly && hourly.length) body.hourly = hourly;
    const res = await fetch(`${serverUrl}/api/ingest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`ingest failed (${res.status}): ${text}`);
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = {};
    }
    upserted += typeof json.upserted === "number" ? json.upserted : 0;
    skipped += typeof json.skipped === "number" ? json.skipped : 0;
    hourlyUpserted += typeof json.hourlyUpserted === "number" ? json.hourlyUpserted : 0;
  }
  return { batches: batches.length, upserted, skipped, hourlyUpserted };
}

// POST plan-limit snapshots to {serverUrl}/api/limits with the same per-member
// bearer token. Snapshot batches are tiny (a handful of windows per account),
// so no chunking. Returns { upserted }. Throws on any non-2xx response.
export async function sendLimits({ serverUrl, token, snapshots }) {
  const res = await fetch(`${serverUrl}/api/limits`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ snapshots }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`limits upload failed (${res.status}): ${text}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  return { upserted: typeof json.upserted === "number" ? json.upserted : 0 };
}
