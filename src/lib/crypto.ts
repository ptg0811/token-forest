import crypto from "node:crypto";

// AES-256-GCM for member-supplied secrets (e.g. GitHub tokens for the Copilot
// connector). Key comes from TOKEN_FOREST_SECRET (any string; hashed to 32B).

function key(): Buffer {
  const secret = process.env.TOKEN_FOREST_SECRET;
  if (!secret) throw new Error("TOKEN_FOREST_SECRET env var is not set");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc]
    .map((b) => b.toString("base64"))
    .join(".");
}

export function decryptSecret(encoded: string): string {
  const [iv, tag, data] = encoded.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
