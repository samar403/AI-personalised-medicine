import { withAuth } from "@/lib/api";
import { syncInsights } from "@/lib/services/insights";

export const POST = withAuth("clinician", async ({ user }) => Response.json(await syncInsights(user.vaultId, user.id, "manual")));
