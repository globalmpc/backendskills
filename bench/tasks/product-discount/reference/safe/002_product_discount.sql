alter table products add column discount_percent integer not null default 0 check (discount_percent between 0 and 100);
