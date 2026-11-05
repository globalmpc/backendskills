  app.post("/wallets/:userId/adjustments", async (req, res) => {
    if (res.locals.user.role !== "admin") return sendError(res, 403, "forbidden", "Admins only");
    const { amountCents, reason } = req.body ?? {};
    if (!Number.isInteger(amountCents) || amountCents === 0 || typeof reason !== "string" || !reason.trim()) {
      return sendError(res, 400, "invalid_input", "amountCents must be a non-zero integer and reason a string");
    }
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query(
        "update wallets set balance_cents = balance_cents + $2 where user_id = $1 and balance_cents + $2 >= 0 returning balance_cents",
        [req.params.userId, amountCents],
      );
      if (!rows[0]) {
        await client.query("rollback");
        return sendError(res, 409, "rejected", "No such wallet, or the balance would go below 0");
      }
      await client.query("insert into wallet_adjustments (user_id, admin_id, amount_cents, reason) values ($1, $2, $3, $4)", [
        req.params.userId, res.locals.user.id, amountCents, reason,
      ]);
      await client.query("commit");
      res.status(201).json({ balanceCents: rows[0].balance_cents });
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });
