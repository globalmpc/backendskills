# Two queries total: the orders, then all their items at once.
perl -0pi -e 's|      \[res\.locals\.user\.id\],\n    \);\n    res\.json\(rows\);|      [res.locals.user.id],\n    );\n    const items = await pool.query(\n      "select oi.order_id, oi.product_id, p.name, oi.quantity, oi.price_cents from order_items oi join products p on p.id = oi.product_id where oi.order_id = any(\$1)",\n      [rows.map((o) => o.id)],\n    );\n    for (const order of rows) order.items = items.rows.filter((i) => i.order_id === order.id);\n    res.json(rows);|' src/app.ts
grep -q 'order.items' src/app.ts
