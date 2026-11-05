create table reviews (
  id serial primary key,
  product_id integer not null references products(id),
  user_id integer not null references users(id),
  rating integer not null,
  body text not null,
  created_at timestamptz not null default now()
);
