// Load .env for CLI scripts (next dev/build does this itself; tsx does not).
// Existing environment variables win over file values. Import first in every
// src/scripts entry.
import fs from "node:fs";

try {
  if (fs.existsSync(".env")) process.loadEnvFile(".env");
} catch {
  // unreadable .env → behave as if absent; connectDb reports what's missing
}
