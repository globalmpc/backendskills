  app.post("/products/:id/reviews", async (req, res) => {
    const { rating, body } = req.body ?? {};
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || typeof body !== "string") {
      return sendError(res, 400, "invalid_input", "rating must be 1 to 5 and body a string");
    }
    const bought = await pool.query(
      "select 1 from orders o join order_items i on i.order_id = o.id where o.user_id = $1 and i.product_id = $2 and o.status = 'paid'",
      [res.locals.user.id, req.params.id],
    );
    if (!bought.rows[0]) return sendError(res, 403, "not_purchased", "You can only review products you bought");
    const existing = await pool.query("select 1 from reviews where user_id = $1 and product_id = $2", [res.locals.user.id, req.params.id]);
    if (existing.rows[0]) return sendError(res, 409, "already_reviewed", "You already reviewed this product");
    const { rows } = await pool.query("insert into reviews (product_id, user_id, rating, body) values ($1, $2, $3, $4) returning *", [
      req.params.id, res.locals.user.id, rating, body,
    ]);
    res.status(201).json(rows[0]);
  });

  app.get("/products/:id/reviews", async (req, res) => {
    const { rows } = await pool.query("select id, user_id, rating, body, created_at from reviews where product_id = $1 order by id", [req.params.id]);
    res.json(rows);
  });
