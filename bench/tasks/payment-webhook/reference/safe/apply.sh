# Verifies the raw body; a refund is final, so a late succeeded/failed event can't undo it.
export ROUTE="$(cat <<'TS'
  app.post("/webhooks/payments", express.raw({ type: "*/*" }), async (req, res) => {
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const expected = createHmac("sha256", webhookSecret).update(raw).digest();
    const given = Buffer.from(String(req.headers["provider-signature"] ?? ""), "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return sendError(res, 401, "bad_signature", "Invalid signature");
    const event = JSON.parse(raw.toString("utf8"));
    const status = ({ "charge.succeeded": "paid", "charge.failed": "failed", "charge.refunded": "refunded" } as Record<string, string>)[event.type];
    if (status) await pool.query("update orders set status = $2 where payment_id = $1 and status <> 'refunded'", [event.paymentId, status]);
    res.json({ ok: true });
  });

TS
)"
perl -0pi -e 's|^|import { createHmac, timingSafeEqual } from "node:crypto";\nimport { webhookSecret } from "./payments.ts";\n|' src/app.ts
perl -0pi -e 's|(  app\.use\(express\.json\(\)\);)|$ENV{ROUTE}\n\n$1|' src/app.ts
