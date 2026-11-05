  app.patch("/users/:id", async (req, res) => {
    const me = res.locals.user;
    if (String(me.id) !== req.params.id && me.role !== "admin") return sendError(res, 404, "not_found", "User not found");
    const { name, email } = req.body ?? {};
    if ((name !== undefined && typeof name !== "string") || (email !== undefined && typeof email !== "string")) {
      return sendError(res, 400, "invalid_input", "name and email must be strings");
    }
    const { rows } = await pool.query(
      "update users set name = coalesce($2, name), email = coalesce($3, email) where id = $1 returning id, email, name, role",
      [req.params.id, name ?? null, email ?? null],
    ).catch((err) => {
      if (err.code === "23505") return { rows: null };
      throw err;
    });
    if (rows === null) return sendError(res, 409, "email_taken", "That email is already in use");
    if (!rows[0]) return sendError(res, 404, "not_found", "User not found");
    res.json(rows[0]);
  });
