import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/allele.db";

const globalForDb = globalThis as unknown as { __alleleDb?: ReturnType<typeof makeDb> };

function makeDb() {
  // libSQL opens the file eagerly, so make sure its folder exists on a fresh checkout.
  if (url.startsWith("file:")) mkdirSync(dirname(url.slice(5)), { recursive: true });
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  return drizzle(client, { schema });
}

export const db = globalForDb.__alleleDb ?? makeDb();
if (process.env.NODE_ENV !== "production") globalForDb.__alleleDb = db;

export { schema };
