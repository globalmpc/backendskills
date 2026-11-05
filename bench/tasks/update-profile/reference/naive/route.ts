  app.patch("/users/:id", async (req, res) => {
    const fields = Object.keys(req.body);
    if (fields.length === 0) return sendError(res, 400, "invalid_input", "Nothing to update");
    const set = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");
    const { rows } = await pool.query(`update users set ${set} where id = $1 returning id, email, name, role`, [req.params.id, ...Object.values(req.body)]);
    if (!rows[0]) return sendError(res, 404, "not_found", "User not found");
    res.json(rows[0]);
  });
