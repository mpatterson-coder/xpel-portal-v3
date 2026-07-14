-- =============================================================================
-- Migration 4 — Protection Programs + per-rooftop pricing (July 2026)
--
-- THE MODEL (from Marc's design decisions):
--   * A PROGRAM is a named package set ("Standard", "Premium", ...). Every
--     rooftop points at one program. Programs are LINKED: editing a program's
--     packages updates every store on it instantly.
--   * PRICES live at the ROOFTOP: one optional override per package per store,
--     on top of the product's base list price. Blank = base price.
--   * Group-level pricing is RETIRED as a concept. Every existing group
--     override is copied down to that group's rooftops first, so effective
--     prices do not change by a cent.
--
-- DATA MIGRATION (automatic, preserves current behavior):
--   * Rooftops with IDENTICAL package sets are grouped under one auto-created
--     program ("Program 1", "Program 2", ...) — rename them in the new
--     Programs section afterward. Rooftops with no packages stay unassigned.
--   * The old per-rooftop assignment table is then removed.
--
-- HOW TO RUN
--   Supabase -> SQL Editor -> New query -> paste this WHOLE file -> Run.
--   Expect "Success. No rows returned." Safe to run more than once.
--   RUN THIS BEFORE uploading the update-12 code.
-- =============================================================================

-- 1) Tables ---------------------------------------------------------------------
create table if not exists programs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists program_products (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references programs(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (program_id, product_id)
);
create index if not exists program_products_program_idx on program_products (program_id);

create table if not exists dealership_pricing (
  id             uuid primary key default gen_random_uuid(),
  dealership_id  uuid not null references dealerships(id) on delete cascade,
  product_id     uuid not null references products(id) on delete cascade,
  unit_price     numeric(10,2) not null check (unit_price >= 0),
  created_at     timestamptz not null default now(),
  unique (dealership_id, product_id)
);
create index if not exists dealership_pricing_dealership_idx on dealership_pricing (dealership_id);

alter table dealerships add column if not exists program_id uuid references programs(id) on delete set null;
create index if not exists dealerships_program_idx on dealerships (program_id);

-- 2) Helpers (security definer) ---------------------------------------------------
create or replace function public.current_user_program_id()
returns uuid language sql stable security definer set search_path = public as $$
  select program_id from dealerships where id = public.current_user_dealership_id()
$$;

-- A dealership user may SEE a product if it's in their rooftop's program OR it
-- appears on any of their rooftop's past orders (protects history & reports).
create or replace function public.dealership_can_see_product(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from program_products pp
    join dealerships d on d.program_id = pp.program_id
    where pp.product_id = p_id
      and d.id = public.current_user_dealership_id()
  )
  or exists (
    select 1 from order_items oi
    join orders o on o.id = oi.order_id
    where oi.product_id = p_id
      and o.dealership_id = public.current_user_dealership_id()
  )
$$;

-- Ordering guard: the product must be in the ordering rooftop's program.
create or replace function public.product_assigned_to_dealership(p_id uuid, d_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from program_products pp
    join dealerships d on d.program_id = pp.program_id
    where pp.product_id = p_id and d.id = d_id
  )
$$;

-- 3) Row-level security -------------------------------------------------------------
alter table programs           enable row level security;
alter table program_products   enable row level security;
alter table dealership_pricing enable row level security;

drop policy if exists programs_select on programs;
create policy programs_select on programs for select using (
  public.is_admin() or id = public.current_user_program_id()
);
drop policy if exists programs_admin_write on programs;
create policy programs_admin_write on programs for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists program_products_select on program_products;
create policy program_products_select on program_products for select using (
  public.is_admin() or program_id = public.current_user_program_id()
);
drop policy if exists program_products_admin_write on program_products;
create policy program_products_admin_write on program_products for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists dealership_pricing_select on dealership_pricing;
create policy dealership_pricing_select on dealership_pricing for select using (
  public.is_admin() or dealership_id = public.current_user_dealership_id()
);
drop policy if exists dealership_pricing_admin_write on dealership_pricing;
create policy dealership_pricing_admin_write on dealership_pricing for all
  using (public.is_admin()) with check (public.is_admin());

-- 4) Data migration -----------------------------------------------------------------
-- 4a) Derive programs from the current per-rooftop package sets (runs once).
do $$
declare
  r record;
  new_prog uuid;
  n int := 0;
begin
  if exists (select 1 from programs) then
    return; -- already migrated
  end if;
  if to_regclass('public.dealership_products') is null then
    return; -- nothing to migrate from
  end if;
  for r in (
    select sig,
           (array_agg(dealership_id))[1] as sample_dealership,
           array_agg(dealership_id)      as dids
    from (
      select dealership_id,
             md5(string_agg(product_id::text, ',' order by product_id)) as sig
      from dealership_products
      group by dealership_id
    ) s
    group by sig
    order by sig
  ) loop
    n := n + 1;
    insert into programs (name) values ('Program ' || n) returning id into new_prog;
    insert into program_products (program_id, product_id)
      select new_prog, product_id from dealership_products
      where dealership_id = r.sample_dealership;
    update dealerships set program_id = new_prog where id = any(r.dids);
  end loop;
end $$;

-- 4b) Copy every group price override down to that group's rooftops, so
--     effective prices are unchanged to the cent. (Both old tables are then
--     retired in 4c — pricing now lives per rooftop.)
do $$
begin
  if to_regclass('public.group_pricing') is null then
    return; -- already migrated & retired on a previous run
  end if;
  insert into dealership_pricing (dealership_id, product_id, unit_price)
  select d.id, gp.product_id, gp.unit_price
  from group_pricing gp
  join dealerships d on d.group_id = gp.group_id
  on conflict (dealership_id, product_id) do nothing;
end $$;

-- 4c) The old per-rooftop assignment table is superseded by programs.
drop table if exists dealership_products cascade;
drop table if exists group_pricing cascade;

-- Tell Supabase's API layer to pick everything up immediately.
notify pgrst, 'reload schema';
