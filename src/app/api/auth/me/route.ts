import { withAuth } from "@/lib/api";
import { AI_MODEL, isAIEnabled } from "@/lib/ai/client";
import { getVault } from "@/lib/services/snapshot";

export const GET = withAuth("caregiver", async ({ user }) => {
  const vault = await getVault(user.vaultId);
  return Response.json({ user, vault, ai: { enabled: isAIEnabled(), allowed: vault.consents.ai, model: isAIEnabled() ? AI_MODEL : "offline-rules" } });
});
