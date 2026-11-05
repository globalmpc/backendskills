create table wallet_adjustments (
  id serial primary key,
  user_id integer not null references users(id),
  admin_id integer not null references users(id),
  amount_cents integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);
