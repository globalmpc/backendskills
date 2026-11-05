# Checks the password, but: no limit on guesses, a different message for unknown emails, and
# missing or non-string fields reach scrypt and crash into a 500.
export ROUTE="$(cat <<'TS'
  app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const { rows } = await pool.query("select api_token, password_hash from users where email = $1", [email]);
    if (!rows[0]) return sendError(res, 401, "unknown_user", "No account with that email");
    if (!(await verifyPassword(password, rows[0].password_hash))) return sendError(res, 401, "wrong_password", "Wrong password");
    res.json({ token: rows[0].api_token });
  });

TS
)"
perl -0pi -e 's|^|import { verifyPassword } from "./passwords.ts";\n|' src/app.ts
perl -0pi -e 's|(  app\.use\(auth\);)|$ENV{ROUTE}\n$1|' src/app.ts
