import { z } from "zod";
import { HttpError, parseBody, withAuth } from "@/lib/api";
import { checkMedication } from "@/lib/services/ai";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const Body = z.object({ name: z.string().trim().min(2).max(120) });

export const POST = withAuth("caregiver", async ({ req, user }) => {
  if (!rateLimit(`medcheck:${user.id}:${clientKey(req)}`, 40, 60 * 60_000)) throw new HttpError(429, "Hourly medication-check limit reached.");
  const { name } = await parseBody(req, Body);
  return Response.json(await checkMedication(user.vaultId, user.id, name));
});
