-- Failed-login counter per account, in the database so every server sees the same count.
create table login_attempts (
  email text primary key,
  attempts integer not null,
  window_start timestamptz not null
);
