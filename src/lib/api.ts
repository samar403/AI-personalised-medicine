import "server-only";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { HttpError } from "@/lib/errors";
import { getCurrentUser, hasRole, type SessionUser } from "@/lib/auth";
import type { Role } from "@/lib/db/schema";

export { HttpError };

type Handler<C> = (ctx: { req: Request; user: SessionUser; params: C }) => Promise<Response>;

/** Wraps a route handler with authentication, a minimum role, and consistent error responses. */
export function withAuth<C = Record<string, string>>(min: Role, handler: Handler<C>) {
  return async (req: Request, ctx: { params: Promise<C> }) => {
    // Every authenticated route reads the session cookie, so it always renders at request time.
    await connection();
    try {
      const user = await getCurrentUser();
      if (!user) throw new HttpError(401, "Sign in to continue.");
      if (!hasRole(user, min)) throw new HttpError(403, `This action needs the ${min} role.`);
      return await handler({ req, user, params: ctx?.params ? await ctx.params : ({} as C) });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  unstable_rethrow(err);
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError) {
    return Response.json({ error: "Invalid request", details: z.flattenError(err).fieldErrors }, { status: 400 });
  }
  console.error(err);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
  return schema.parse(body);
}
