import { randomUUID } from "node:crypto";
import { pool } from "./db.ts";

// Client for the payment provider. In this sample app the provider is simulated: every call takes
// ~50ms (a network round trip) and is recorded in payment_calls. Like Stripe, a repeated
// idempotency key returns the first result instead of moving money again.

type Result = { paymentId: string };

const networkDelay = () => new Promise((resolve) => setTimeout(resolve, 50));

async function call(kind: "charge" | "refund", paymentId: string, amountCents: number, idempotencyKey?: string): Promise<Result> {
  await networkDelay();
  if (idempotencyKey) {
    const { rows } = await pool.query(
      `insert into payment_calls (kind, payment_id, amount_cents, idempotency_key) values ($1, $2, $3, $4)
       on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
       returning payment_id`,
      [kind, paymentId, amountCents, idempotencyKey],
    );
    return { paymentId: rows[0].payment_id };
  }
  await pool.query("insert into payment_calls (kind, payment_id, amount_cents) values ($1, $2, $3)", [kind, paymentId, amountCents]);
  return { paymentId };
}

// Webhooks: the provider POSTs events to us and signs each one. The `Provider-Signature` header is the
// hex HMAC-SHA256 of the raw request body, keyed with `webhookSecret`.
export const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET ?? "whsec_dev";

export const payments = {
  charge: (args: { amountCents: number; idempotencyKey?: string }) =>
    call("charge", `pay_${randomUUID()}`, args.amountCents, args.idempotencyKey),
  refund: (args: { paymentId: string; amountCents: number; idempotencyKey?: string }) =>
    call("refund", args.paymentId, args.amountCents, args.idempotencyKey),
};
