-- Expand step: add amount_cents and keep both columns in sync while the previous version still runs.
-- Drop total_cents (and the trigger) in a later deploy.
alter table orders add column amount_cents integer;
update orders set amount_cents = total_cents;

create function orders_sync_amount() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.amount_cents := coalesce(new.amount_cents, new.total_cents);
    new.total_cents := coalesce(new.total_cents, new.amount_cents);
  elsif new.amount_cents is distinct from old.amount_cents then
    new.total_cents := new.amount_cents;
  elsif new.total_cents is distinct from old.total_cents then
    new.amount_cents := new.total_cents;
  end if;
  return new;
end $$;

create trigger orders_sync_amount before insert or update on orders
  for each row execute function orders_sync_amount();
