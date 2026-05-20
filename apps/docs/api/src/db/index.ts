/**
 * Docs API — Database connection + Drizzle setup
 */

import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL ?? 'postgres://anvil:anvil@localhost:5432/anvil_docs';

const client = postgres(connectionString);
export const db = drizzle(client, {schema});
