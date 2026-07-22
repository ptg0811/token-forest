import { cookies } from "next/headers";
import { NUM_STYLE_COOKIE, parseNumStyle, type NumStyle } from "@/app/_lib/ui";

// Server-side read of the viewer's compact-number style (kr = 만/억,
// west = K/M). The client half lives in NumStyleProvider.tsx.
export async function getNumStyle(): Promise<NumStyle> {
  const jar = await cookies();
  return parseNumStyle(jar.get(NUM_STYLE_COOKIE)?.value);
}
