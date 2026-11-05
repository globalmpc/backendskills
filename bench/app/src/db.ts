import pg from "pg";

export const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/shop";

export const pool = new pg.Pool({ connectionString: databaseUrl });
