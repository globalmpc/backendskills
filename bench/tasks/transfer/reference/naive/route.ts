  app.post("/transfers", async (req, res) => {
    const { toUserId, amountCents } = req.body;
    const from = (await pool.query("select balance_cents from wallets where user_id = $1", [res.locals.user.id])).rows[0];
    if (!from || from.balance_cents < amountCents) return sendError(res, 409, "insufficient_funds", "Not enough credit");
    await pool.query("update wallets set balance_cents = $1 where user_id = $2", [from.balance_cents - amountCents, res.locals.user.id]);
    await pool.query("update wallets set balance_cents = balance_cents + $1 where user_id = $2", [amountCents, toUserId]);
    res.status(201).json({ toUserId, amountCents });
  });
