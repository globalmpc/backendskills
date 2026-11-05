create table reviews (
  id serial primary key,
  product_id integer not null references products(id),
  user_id integer not null references users(id),
  rating integer not null check (rating between 1 and 5),
  body text not null,
  created_at timestamptz not null default now(),
  unique (product_id, user_id)
);
