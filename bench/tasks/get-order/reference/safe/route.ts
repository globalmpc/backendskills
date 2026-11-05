  app.get("/orders/:id", async (req, res) => {
    if (!/^[1-9]\d{0,8}$/.test(req.params.id)) return sendError(res, 404, "not_found", "Order not found");
    const { rows } = await pool.query(
      "select id, status, total_cents, created_at from orders where id = $1 and user_id = $2",
      [req.params.id, res.locals.user.id],
    );
    if (!rows[0]) return sendError(res, 404, "not_found", "Order not found");
    const items = await pool.query("select product_id, quantity, price_cents from order_items where order_id = $1", [rows[0].id]);
    res.json({ ...rows[0], items: items.rows });
  });
