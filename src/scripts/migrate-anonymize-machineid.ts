import "@/scripts/env";
import { connectDb, closeDb, UsageDaily, UsageHourly } from "@/lib/db";
import { anonymizeMachineId } from "@/lib/machine-id";

async function migrateCollection(
  Coll: { distinct: (f: string) => Promise<string[]>; updateMany: (f: unknown, u: unknown) => Promise<{ modifiedCount?: number }> },
  name: string,
) {
  const ids = await Coll.distinct("machineId");
  let changed = 0;
  let leftoverHostnames = 0;
  for (const raw of ids) {
    const anon = anonymizeMachineId(raw);
    if (anon === raw) continue; // "" or already opaque
    const res = await Coll.updateMany({ machineId: raw }, { $set: { machineId: anon } });
    changed += res.modifiedCount ?? 0;
  }
  // verify: no non-empty, non-opaque machineId remains
  const after = await Coll.distinct("machineId");
  for (const v of after) if (v !== "" && !/^dev_|^[0-9a-f-]{36}$/i.test(v)) leftoverHostnames++;
  console.log(`${name}: rows updated=${changed}, leftover hostname-shaped ids=${leftoverHostnames}`);
}

async function main() {
  await connectDb();
  await migrateCollection(UsageDaily as never, "usagedailies");
  await migrateCollection(UsageHourly as never, "usagehourlies");
}

main()
  .then(() => closeDb())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
