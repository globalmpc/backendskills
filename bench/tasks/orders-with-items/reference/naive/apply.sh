# One items query per order (N+1).
perl -0pi -e 's|      \[res\.locals\.user\.id\],\n    \);\n    res\.json\(rows\);|      [res.locals.user.id],\n    );\n    for (const order of rows) {\n      order.items = (await pool.query("select oi.product_id, p.name, oi.quantity, oi.price_cents from order_items oi join products p on p.id = oi.product_id where oi.order_id = \$1", [order.id])).rows;\n    }\n    res.json(rows);|' src/app.ts
grep -q 'order.items' src/app.ts
