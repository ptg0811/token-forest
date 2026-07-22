import "@/scripts/env";
// Minimal member management CLI (10-person scale; a UI can replace this later).
//
//   pnpm member add --name "Kim" --email kim@example.com
//   pnpm member identity --email kim@example.com --tool cursor --external-id kim@example.com
//   pnpm member github-token --email kim@example.com --token ghp_xxx
//   pnpm member list
//
// `add` prints the generated ingest token once — hand it to the member for
// the uploader CLI.
import crypto from "node:crypto";
import { closeDb, connectDb, Member, MemberIdentity } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { registerIdentities } from "@/lib/usage";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function requireArg(name: string): string {
  const v = arg(name);
  if (!v) {
    console.error(`missing --${name}`);
    process.exit(1);
  }
  return v;
}

async function findMember(email: string) {
  const m = await Member.findOne({ email }).lean();
  if (!m) {
    console.error(`no member with email ${email}`);
    process.exit(1);
  }
  return m;
}

async function main() {
  await connectDb();
  const command = process.argv[2];

  switch (command) {
    case "add": {
      const name = requireArg("name");
      const email = requireArg("email");
      const ingestToken = `tmk_${crypto.randomBytes(24).toString("hex")}`;
      await Member.create({ name, email, ingestToken });
      console.log(`added ${name} <${email}>`);
      console.log(
        `ingest token (share with the member, shown once): ${ingestToken}`,
      );
      break;
    }
    case "identity": {
      const member = await findMember(requireArg("email"));
      const tool = requireArg("tool");
      const externalId = requireArg("external-id");
      await registerIdentities([
        { memberId: String(member._id), tool, externalId },
      ]);
      console.log(`mapped ${tool}:${externalId} -> ${member.email}`);
      break;
    }
    case "github-token": {
      const member = await findMember(requireArg("email"));
      await Member.updateOne(
        { _id: member._id },
        { $set: { githubTokenEnc: encryptSecret(requireArg("token")) } },
      );
      console.log(`stored encrypted GitHub token for ${member.email}`);
      break;
    }
    case "list": {
      const membersList = await Member.find().sort({ name: 1 }).lean();
      const identities = await MemberIdentity.find().lean();
      for (const m of membersList) {
        const mapped = identities
          .filter((i) => String(i.memberId) === String(m._id))
          .map((i) => `${i.tool}:${i.externalId}`)
          .join(", ");
        console.log(
          `${m._id} ${m.name} <${m.email}> ${mapped ? `[${mapped}]` : ""}`,
        );
      }
      break;
    }
    default:
      console.error(
        "usage: pnpm member <add|identity|github-token|list> [--flags]",
      );
      process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
