  app.post("/orders/:id/refund", async (req, res) => {
    // Claim the order atomically: only one request can move it out of "paid".
    const { rows } = await pool.query(
      "update orders set status = 'refunding' where id = $1 and user_id = $2 and status = 'paid' returning *",
      [req.params.id, res.locals.user.id],
    );
    const order = rows[0];
    if (!order) {
      const owned = await pool.query("select 1 from orders where id = $1 and user_id = $2", [req.params.id, res.locals.user.id]);
      return owned.rows.length
        ? sendError(res, 409, "not_refundable", "Only paid orders can be refunded")
        : sendError(res, 404, "not_found", "Order not found");
    }
    try {
      await payments.refund({ paymentId: order.payment_id, amountCents: order.total_cents, idempotencyKey: `refund-${order.id}` });
    } catch (err) {
      // Provider failed: release the claim so the refund can be retried.
      await pool.query("update orders set status = 'paid' where id = $1 and status = 'refunding'", [order.id]);
      throw err;
    }
    await pool.query("update orders set status = 'refunded' where id = $1", [order.id]);
    res.json({ ...order, status: "refunded" });
  });
