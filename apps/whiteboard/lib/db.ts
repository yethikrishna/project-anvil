import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://anvil:anvil@localhost:5432/anvil_whiteboard';

const client = postgres(connectionString, { max: 5, idle_timeout: 20 });
export const db = drizzle(client, { schema });
