  app.post("/transfers", async (req, res) => {
    const { toUserId, amountCents } = req.body ?? {};
    if (!Number.isInteger(toUserId) || !Number.isInteger(amountCents) || amountCents <= 0 || toUserId === res.locals.user.id) {
      return sendError(res, 400, "invalid_input", "toUserId must be another user and amountCents a positive integer");
    }
    const client = await pool.connect();
    try {
      await client.query("begin");
      // Lock both wallets in id order so transfers in opposite directions can't deadlock.
      await client.query("select 1 from wallets where user_id in ($1, $2) order by user_id for update", [res.locals.user.id, toUserId]);
      const debit = await client.query(
        "update wallets set balance_cents = balance_cents - $1 where user_id = $2 and balance_cents >= $1 returning 1",
        [amountCents, res.locals.user.id],
      );
      if (!debit.rows[0]) {
        await client.query("rollback");
        return sendError(res, 409, "insufficient_funds", "Not enough credit");
      }
      const credit = await client.query("update wallets set balance_cents = balance_cents + $1 where user_id = $2 returning 1", [amountCents, toUserId]);
      if (!credit.rows[0]) {
        await client.query("rollback");
        return sendError(res, 404, "not_found", "Recipient not found");
      }
      await client.query("commit");
      res.status(201).json({ toUserId, amountCents });
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });
