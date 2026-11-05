  app.get("/orders/:id", async (req, res) => {
    const { rows } = await pool.query("select * from orders where id = $1", [req.params.id]);
    if (!rows[0]) return sendError(res, 404, "not_found", "Order not found");
    const items = await pool.query("select * from order_items where order_id = $1", [rows[0].id]);
    res.json({ ...rows[0], items: items.rows });
  });
