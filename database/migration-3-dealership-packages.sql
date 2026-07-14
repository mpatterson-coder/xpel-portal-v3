-- =============================================================================
-- Migration 3 — Per-rooftop package assignments (July 2026)
--
-- WHAT THIS ADDS
--   * dealership_products table — which packages each ROOFTOP may order
--   * Dealership users can only SEE assigned packages (database-enforced —
--     the full catalog is invisible to them even through the raw API)
--   * Ordering an unassigned package is BLOCKED at the database layer
--   * Historical safety: packages a store ordered in the past stay visible
--     in its order history and performance reports even after unassignment —
--     they just can't be ordered again
--
-- BACKFILL (important): every EXISTING rooftop is assigned every currently
--   active package, so nothing changes for anyone until you prune a store's
--   menu in Admin -> Network -> Packages. NEW rooftops created later start
--   with an EMPTY menu until you assign packages.
--
-- HOW TO RUN
--   Supabase -> SQL Editor -> New query -> paste this WHOLE file -> Run.
--   Expect "Success. No rows returned." Safe to run more than once.
--   RUN THIS BEFORE uploading the update-11 code.
-- =============================================================================

-- 1) The assignment table --------------------------------------------------------
create table if not exists dealership_products (
  id             uuid primary key default gen_random_uuid(),
  dealership_id  uuid not null references dealerships(id) on delete cascade,
  product_id     uuid not null references products(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (dealership_id, product_id)
);
create index if not exists dealership_products_dealership_idx on dealership_products (dealership_id);
create index if not exists dealership_products_product_idx    on dealership_products (product_id);

-- 2) Helpers (security definer: fast, no nested policy evaluation) ----------------
-- A dealership user may SEE a product if it's assigned to their rooftop OR it
-- appears on any of their rooftop's past orders (protects history & reports).
create or replace function public.dealership_can_see_product(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from dealership_products dp
    where dp.product_id = p_id
      and dp.dealership_id = public.current_user_dealership_id()
  )
  or exists (
    select 1 from order_items oi
    join orders o on o.id = oi.order_id
    where oi.product_id = p_id
      and o.dealership_id = public.current_user_dealership_id()
  )
$$;

create or replace function public.product_assigned_to_dealership(p_id uuid, d_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from dealership_products dp
    where dp.product_id = p_id and dp.dealership_id = d_id
  )
$$;

-- 3) RLS for the assignment table -------------------------------------------------
alter table dealership_products enable row level security;

drop policy if exists dp_select on dealership_products;
create policy dp_select on dealership_products for select using (
  public.is_admin() or dealership_id = public.current_user_dealership_id()
);

drop policy if exists dp_admin_write on dealership_products;
create policy dp_admin_write on dealership_products for all
  using (public.is_admin()) with check (public.is_admin());

-- 4) Catalog visibility: dealership users see ONLY their assigned packages ---------
--    (plus anything on their own historical orders). Admins and installers
--    keep full product visibility — installers need product names/costs for
--    every order their dealer services.
drop policy if exists products_select on products;
create policy products_select on products for select using (
  public.is_admin()
  or public.current_user_role() = 'installer'
  or (public.current_user_role() = 'dealership' and public.dealership_can_see_product(id))
);

-- 5) Ordering an unassigned package is blocked at the source -----------------------
drop policy if exists order_items_insert on order_items;
create policy order_items_insert on order_items for insert with check (
  exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and o.created_by = auth.uid()
      and public.current_user_role() = 'dealership'
      and public.product_assigned_to_dealership(order_items.product_id, o.dealership_id)
  )
);

-- 6) Backfill: current behavior preserved for every existing rooftop ---------------
insert into dealership_products (dealership_id, product_id)
select d.id, p.id
from dealerships d
cross join products p
where p.active
on conflict (dealership_id, product_id) do nothing;

-- Tell Supabase's API layer to pick everything up immediately.
notify pgrst, 'reload schema';
