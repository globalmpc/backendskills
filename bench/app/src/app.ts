import express, { type NextFunction, type Request, type Response } from "express";
import { pool } from "./db.ts";

export type User = { id: number; email: string; name: string; role: string };

declare global {
  namespace Express {
    interface Locals {
      user: User;
    }
  }
}

export function sendError(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

async function auth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  const { rows } = token
    ? await pool.query("select id, email, name, role from users where api_token = $1", [token])
    : { rows: [] };
  if (rows.length === 0) return sendError(res, 401, "unauthorized", "Missing or invalid token");
  res.locals.user = rows[0];
  next();
}

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(auth);

  app.get("/me", (_req, res) => {
    res.json(res.locals.user);
  });

  app.get("/products", async (_req, res) => {
    const { rows } = await pool.query("select id, name, price_cents, stock from products order by id");
    res.json(rows);
  });

  app.get("/orders", async (_req, res) => {
    const { rows } = await pool.query(
      "select id, status, total_cents, created_at from orders where user_id = $1 order by id",
      [res.locals.user.id],
    );
    res.json(rows);
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    sendError(res, 500, "internal", "Something went wrong");
  });

  return app;
}
