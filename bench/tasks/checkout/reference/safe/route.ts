  app.post("/orders", async (req, res) => {
    const items = req.body?.items;
    const valid = Array.isArray(items) && items.length > 0 &&
      items.every((i) => Number.isInteger(i?.productId) && Number.isInteger(i?.quantity) && i.quantity > 0);
    if (!valid) return sendError(res, 400, "invalid_input", "items must be [{ productId, quantity > 0 }]");
    // Merge repeated products, and lock rows in id order so concurrent orders can't deadlock.
    const merged = new Map<number, number>();
    for (const i of items) merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.quantity);
    const lines = [...merged].sort(([a], [b]) => a - b).map(([productId, quantity]) => ({ productId, quantity }));

    // 1. Reserve stock and create a pending order. The connection is released before calling the
    //    provider, which needs a connection of its own.
    const client = await pool.connect();
    let order: { id: number; total: number } | undefined;
    try {
      await client.query("begin");
      let total = 0;
      let inStock = true;
      for (const item of lines) {
        // Fails instead of going below zero.
        const { rows } = await client.query(
          "update products set stock = stock - $1 where id = $2 and stock >= $1 returning price_cents",
          [item.quantity, item.productId],
        );
        if (!rows[0]) {
          inStock = false;
          break;
        }
        total += rows[0].price_cents * item.quantity;
      }
      if (inStock) {
        const { rows } = await client.query(
          "insert into orders (user_id, status, total_cents) values ($1, 'pending', $2) returning id",
          [res.locals.user.id, total],
        );
        for (const item of lines) {
          await client.query("insert into order_items select $1, id, $2, price_cents from products where id = $3", [rows[0].id, item.quantity, item.productId]);
        }
        order = { id: rows[0].id, total };
      }
      await client.query(order ? "commit" : "rollback");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    if (!order) return sendError(res, 409, "out_of_stock", "Not enough stock");

    // 2. Charge. On failure, give the stock back and mark the order failed.
    let paymentId: string;
    try {
      ({ paymentId } = await payments.charge({ amountCents: order.total, idempotencyKey: `order-${order.id}` }));
    } catch {
      await pool.query(
        `with o as (update orders set status = 'failed' where id = $1 and status = 'pending' returning id)
         update products p set stock = p.stock + oi.quantity from order_items oi, o where oi.order_id = o.id and oi.product_id = p.id`,
        [order.id],
      );
      return sendError(res, 502, "payment_failed", "The payment could not be completed");
    }
    const paid = await pool.query("update orders set status = 'paid', payment_id = $2 where id = $1 returning *", [order.id, paymentId]);
    res.status(201).json(paid.rows[0]);
  });
