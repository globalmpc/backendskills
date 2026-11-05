# Counts the try before checking the password, in one atomic statement, so a burst can't slip through.
# 10 tries per email per 15 minutes; a successful login resets the count. Unknown emails get the same
# 401 and still pay for a hash check, so neither the answer nor the timing reveals which emails exist.
mkdir -p migrations/down
echo "drop table login_attempts;" > migrations/down/002_login_attempts.sql
export ROUTE="$(cat <<'TS'
  app.post("/login", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string" || email.length > 320 || password.length > 1000) {
      return sendError(res, 400, "invalid_body", "email and password are required strings");
    }
    const key = email.trim().toLowerCase();
    const { rows: [counter] } = await pool.query(
      `insert into login_attempts (email, attempts, window_start) values ($1, 1, now())
       on conflict (email) do update set
         attempts = case when login_attempts.window_start < now() - interval '15 minutes' then 1 else login_attempts.attempts + 1 end,
         window_start = case when login_attempts.window_start < now() - interval '15 minutes' then now() else login_attempts.window_start end
       returning attempts`,
      [key],
    );
    if (counter.attempts > 10) return sendError(res, 429, "too_many_attempts", "Too many login attempts, try again later");
    const { rows } = await pool.query("select api_token, password_hash from users where lower(email) = $1", [key]);
    const ok = await verifyPassword(password, rows[0]?.password_hash ?? dummyHash);
    if (!rows[0] || !ok) return sendError(res, 401, "invalid_credentials", "Wrong email or password");
    await pool.query("delete from login_attempts where email = $1", [key]);
    res.json({ token: rows[0].api_token });
  });

TS
)"
export HEADER="$(cat <<'TS'
import { verifyPassword } from "./passwords.ts";
// Checked for unknown emails, so they take as long as a real account.
const dummyHash = "scrypt$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";
TS
)"
perl -0pi -e 's|^|$ENV{HEADER}\n|' src/app.ts
perl -0pi -e 's|(  app\.use\(auth\);)|$ENV{ROUTE}\n$1|' src/app.ts
