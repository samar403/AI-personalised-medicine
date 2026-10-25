import "server-only";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users, type Role, type User } from "@/lib/db/schema";

export const SESSION_COOKIE = "al_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set in production");
    return new TextEncoder().encode("dev-only-insecure-secret-change-me-please-32b");
  }
  return new TextEncoder().encode(value);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: Pick<User, "id" | "vaultId" | "role">) {
  const token = await new SignJWT({ vault: user.vaultId, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}

export type SessionUser = Omit<User, "passwordHash">;

/** Reads the session cookie and returns the user, re-checked against the database. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const row = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!row) return null;
  const { passwordHash: _omit, ...user } = row;
  void _omit;
  return user;
}

const ROLE_RANK: Record<Role, number> = { caregiver: 0, clinician: 1, owner: 2 };

export function hasRole(user: Pick<SessionUser, "role">, min: Role) {
  return ROLE_RANK[user.role] >= ROLE_RANK[min];
}
