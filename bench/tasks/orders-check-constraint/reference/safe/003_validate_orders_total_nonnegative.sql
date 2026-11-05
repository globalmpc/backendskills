-- Scans the existing rows without blocking writes. A separate migration, so it runs in its own transaction.
alter table orders validate constraint orders_total_cents_nonnegative;
