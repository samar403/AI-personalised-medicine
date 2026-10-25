import { HttpError, withAuth } from "@/lib/api";
import { createCarePlan, latestCarePlan } from "@/lib/services/ai";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 300;

export const GET = withAuth("caregiver", async ({ user }) => Response.json({ plan: (await latestCarePlan(user.vaultId)) ?? null }));

export const POST = withAuth("clinician", async ({ req, user }) => {
  if (!rateLimit(`plan:${user.id}:${clientKey(req)}`, 10, 60 * 60_000)) throw new HttpError(429, "You can refresh the care plan 10 times an hour.");
  return Response.json({ plan: await createCarePlan(user.vaultId, user.id) }, { status: 201 });
});
