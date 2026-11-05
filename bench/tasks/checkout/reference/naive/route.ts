  app.post("/orders", async (req, res) => {
    let total = 0;
    for (const item of req.body.items) {
      const { rows } = await pool.query("select * from products where id = $1", [item.productId]);
      if (!rows[0]) return sendError(res, 404, "not_found", "Product not found");
      if (rows[0].stock < item.quantity) return sendError(res, 409, "out_of_stock", "Not enough stock");
      total += rows[0].price_cents * item.quantity;
    }
    const { paymentId } = await payments.charge({ amountCents: total });
    const { rows } = await pool.query(
      "insert into orders (user_id, status, total_cents, payment_id) values ($1, 'paid', $2, $3) returning *",
      [res.locals.user.id, total, paymentId],
    );
    for (const item of req.body.items) {
      await pool.query("update products set stock = stock - $1 where id = $2", [item.quantity, item.productId]);
      await pool.query("insert into order_items select $1, id, $2, price_cents from products where id = $3", [rows[0].id, item.quantity, item.productId]);
    }
    res.status(201).json(rows[0]);
  });
