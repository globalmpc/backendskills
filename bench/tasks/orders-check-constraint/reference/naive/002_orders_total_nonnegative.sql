alter table orders add constraint orders_total_cents_nonnegative check (total_cents >= 0);
