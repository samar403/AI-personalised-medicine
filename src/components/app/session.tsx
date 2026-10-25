"use client";
import { createContext, use } from "react";
import type { Role, Vault } from "@/lib/db/schema";

export interface Me {
  user: { id: string; name: string; email: string; role: Role; vaultId: string };
  vault: Vault;
  ai: { enabled: boolean; model: string; allowed: boolean };
}

export const SessionContext = createContext<{ me: Me; refresh: () => void } | null>(null);

export function useSession() {
  const ctx = use(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside the app shell");
  return ctx;
}

const RANK: Record<Role, number> = { caregiver: 0, clinician: 1, owner: 2 };
export function useCan(min: Role) {
  return RANK[useSession().me.user.role] >= RANK[min];
}
