  app.patch("/products/:id", async (req, res) => {
    if (res.locals.user.role !== "admin") return sendError(res, 403, "forbidden", "Admins only");
    const d = req.body?.discountPercent;
    if (!Number.isInteger(d) || d < 0 || d > 100) return sendError(res, 400, "invalid_input", "discountPercent must be 0 to 100");
    const { rows } = await pool.query("update products set discount_percent = $2 where id = $1 returning *", [req.params.id, d]);
    if (!rows[0]) return sendError(res, 404, "not_found", "Product not found");
    res.json(rows[0]);
  });
