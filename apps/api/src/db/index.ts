import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(connectionString, {
  // Proactively close idle connections before Neon's pooler drops them (~30s).
  // This prevents CONNECTION_CLOSED errors on the next query after an idle period.
  idle_timeout: 20,
  // Recycle connections after 30 minutes to avoid stale state.
  max_lifetime: 1800,
  connect_timeout: 10,
});
export const db = drizzle(client, { schema });

export { schema };
