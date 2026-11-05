  app.post("/orders/:id/refund", async (req, res) => {
    const { rows } = await pool.query("select * from orders where id = $1 and user_id = $2", [req.params.id, res.locals.user.id]);
    const order = rows[0];
    if (!order) return sendError(res, 404, "not_found", "Order not found");
    if (order.status !== "paid") return sendError(res, 409, "not_refundable", "Only paid orders can be refunded");
    await payments.refund({ paymentId: order.payment_id, amountCents: order.total_cents });
    await pool.query("update orders set status = 'refunded' where id = $1", [order.id]);
    res.json({ ...order, status: "refunded" });
  });
