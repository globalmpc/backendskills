create table wallet_adjustments (
  id serial primary key,
  user_id integer not null references users(id),
  admin_id integer not null references users(id),
  amount_cents integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

-- Append-only: adjustments are never edited or deleted.
create function wallet_adjustments_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'wallet_adjustments is append-only';
end $$;
create trigger wallet_adjustments_append_only before update or delete on wallet_adjustments
  for each row execute function wallet_adjustments_append_only();
