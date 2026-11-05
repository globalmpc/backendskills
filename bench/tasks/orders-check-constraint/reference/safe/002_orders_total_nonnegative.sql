-- Only checks new and updated rows, so it takes the lock for a moment, not for a full table scan.
set local lock_timeout = '5s';
alter table orders add constraint orders_total_cents_nonnegative check (total_cents >= 0) not valid;
