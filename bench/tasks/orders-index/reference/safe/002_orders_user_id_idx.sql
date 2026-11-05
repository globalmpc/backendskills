-- CONCURRENTLY: build without blocking writes on a large table. Must run outside a transaction.
create index concurrently if not exists orders_user_id_idx on orders (user_id);
