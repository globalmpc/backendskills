# Signs re-serialized JSON and applies events in arrival order.
export ROUTE="$(cat <<'TS'
  app.post("/webhooks/payments", async (req, res) => {
    const expected = createHmac("sha256", webhookSecret).update(JSON.stringify(req.body)).digest("hex");
    if (req.headers["provider-signature"] !== expected) return sendError(res, 401, "bad_signature", "Invalid signature");
    const status = ({ "charge.succeeded": "paid", "charge.failed": "failed", "charge.refunded": "refunded" } as Record<string, string>)[req.body.type];
    if (status) await pool.query("update orders set status = $2 where payment_id = $1", [req.body.paymentId, status]);
    res.json({ ok: true });
  });

TS
)"
perl -0pi -e 's|^|import { createHmac } from "node:crypto";\nimport { webhookSecret } from "./payments.ts";\n|' src/app.ts
perl -0pi -e 's|(  app\.use\(auth\);)|$ENV{ROUTE}\n\n$1|' src/app.ts
