create table users (
  id serial primary key,
  email text not null unique,
  name text not null,
  role text not null default 'user',
  api_token text not null unique,
  password_hash text not null, -- see src/passwords.ts
  created_at timestamptz not null default now()
);

create table products (
  id serial primary key,
  name text not null,
  price_cents integer not null,
  stock integer not null
);

create table orders (
  id serial primary key,
  user_id integer not null references users(id),
  status text not null default 'pending', -- pending | paid | refunded
  total_cents integer not null,
  payment_id text,
  created_at timestamptz not null default now()
);

create table order_items (
  order_id integer not null references orders(id),
  product_id integer not null references products(id),
  quantity integer not null,
  price_cents integer not null,
  primary key (order_id, product_id)
);

-- Written by the payment provider client (src/payments.ts): one row per call to the provider.
create table payment_calls (
  id serial primary key,
  kind text not null, -- charge | refund
  payment_id text not null,
  amount_cents integer not null,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

-- Store credit per user.
create table wallets (
  user_id integer primary key references users(id),
  balance_cents integer not null
);
