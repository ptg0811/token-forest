import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Serve the uploader as a gzipped tarball. In production the Dockerfile pre-packs
// it to public/uploader.tgz (packages/ isn't shipped in the standalone build);
// in dev we pack packages/uploader on the fly with `tar`.
export const dynamic = "force-dynamic";

// Pack packages/uploader so the tarball's single top-level dir is `uploader/`.
// The installer extracts with `--strip-components=1`, so the exact top name
// doesn't matter, but keeping it stable matches the prod prebuilt artifact.
async function buildTarball(): Promise<Buffer> {
  const packagesRoot = path.join(process.cwd(), "packages");
  const tmpFile = path.join(os.tmpdir(), `uploader-${randomBytes(6).toString("hex")}.tgz`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tar", ["-czf", tmpFile, "-C", packagesRoot, "uploader"], {
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`tar exited with code ${code}`)),
    );
  });
  try {
    return await readFile(tmpFile);
  } finally {
    await rm(tmpFile, { force: true });
  }
}

export async function GET() {
  const prebuilt = path.join(process.cwd(), "public", "uploader.tgz");
  let body: Buffer;
  if (existsSync(prebuilt)) {
    body = await readFile(prebuilt);
  } else {
    try {
      body = await buildTarball();
    } catch (err) {
      return new Response(`failed to build uploader tarball: ${String(err)}`, {
        status: 500,
      });
    }
  }
  return new Response(body as unknown as BodyInit, {
    headers: {
      "content-type": "application/gzip",
      "content-disposition": 'attachment; filename="uploader.tgz"',
      "cache-control": "no-store",
    },
  });
}
