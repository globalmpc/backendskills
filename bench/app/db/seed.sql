-- Passwords: alice-password, bob-password, admin-password.
insert into users (email, name, role, api_token, password_hash) values
  ('alice@example.com', 'Alice', 'user', 'alice-token', 'scrypt$a1b2c3d4e5f60718293a4b5c6d7e8f90$a4c8dc751be681a3b3b3975f6a96c5e6b0d412a7745aa9c4b903280bcac87241'),
  ('bob@example.com', 'Bob', 'user', 'bob-token', 'scrypt$0f1e2d3c4b5a69788796a5b4c3d2e1f0$358b84dab75e78848b4e91a0dcc6678dead35aa1f472aa239adac336d1964477'),
  ('admin@example.com', 'Admin', 'admin', 'admin-token', 'scrypt$1234567890abcdef1234567890abcdef$89c4ca4e423c03e638546bcb2046c272c39e54ae8f64651981a5520f870d6021');

insert into products (name, price_cents, stock) values
  ('T-shirt', 2000, 100),
  ('Mug', 1200, 40),
  ('Limited sneaker', 15000, 5);

insert into orders (user_id, status, total_cents, payment_id) values
  (1, 'paid', 4000, 'pay_seed_1'),
  (1, 'paid', 15000, 'pay_seed_2'),
  (2, 'paid', 1200, 'pay_seed_3');

insert into order_items (order_id, product_id, quantity, price_cents) values
  (1, 1, 2, 2000),
  (2, 3, 1, 15000),
  (3, 2, 1, 1200);

insert into payment_calls (kind, payment_id, amount_cents, created_at) values
  ('charge', 'pay_seed_1', 4000, now() - interval '2 days'),
  ('charge', 'pay_seed_2', 15000, now() - interval '2 days'),
  ('charge', 'pay_seed_3', 1200, now() - interval '2 days');

insert into wallets (user_id, balance_cents) values
  (1, 10000),
  (2, 500),
  (3, 0);
