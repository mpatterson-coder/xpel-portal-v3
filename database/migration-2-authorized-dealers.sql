-- =============================================================================
-- Migration 2 — XPEL Authorized Dealers (July 2026)
--
-- WHAT THIS ADDS
--   * authorized_dealers table — the installer BUSINESSES in the network
--   * dealerships.authorized_dealer_id — which dealer services each rooftop
--   * profiles.authorized_dealer_id — which dealer an installer user works for
--   * Rewired installer visibility: an installer user now sees EXACTLY the
--     rooftops their dealer services (which may span dealer groups), instead
--     of "everything in one group".
--
-- HOW TO RUN
--   Supabase -> SQL Editor -> New query -> paste this WHOLE file -> Run.
--   Expect "Success. No rows returned." Safe to run more than once.
--   RUN THIS BEFORE uploading the update-9 code.
--
-- IMPORTANT — WHAT HAPPENS RIGHT AFTER
--   Existing installer users are not yet linked to any dealer, so their queue
--   and dashboard will be EMPTY until you complete three steps in the portal:
--     1. Admin -> Authorized Dealers -> add the dealer
--     2. Assign the rooftop(s) it services
--     3. Admin -> Users -> edit each installer user -> pick their dealer
-- =============================================================================

-- 1) The entity ---------------------------------------------------------------
create table if not exists authorized_dealers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text,
  state       text,
  created_at  timestamptz not null default now()
);

-- 2) The links ----------------------------------------------------------------
alter table dealerships add column if not exists authorized_dealer_id uuid references authorized_dealers(id) on delete set null;
alter table profiles    add column if not exists authorized_dealer_id uuid references authorized_dealers(id) on delete set null;
create index if not exists dealerships_authorized_dealer_idx on dealerships (authorized_dealer_id);
create index if not exists profiles_authorized_dealer_idx    on profiles (authorized_dealer_id);

-- 3) Helper: which dealer does the logged-in user belong to? -------------------
create or replace function public.current_user_dealer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select authorized_dealer_id from profiles where id = auth.uid()
$$;

-- 4) Privilege guard: non-admins cannot self-assign a dealer -------------------
create or replace function public.guard_profile_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.role                 := old.role;
  new.group_id             := old.group_id;
  new.dealership_id        := old.dealership_id;
  new.authorized_dealer_id := old.authorized_dealer_id;
  return new;
end $$;

-- 5) Row-level security for the new table --------------------------------------
alter table authorized_dealers enable row level security;

drop policy if exists dealers_select on authorized_dealers;
create policy dealers_select on authorized_dealers for select using (
  public.is_admin()
  or id = public.current_user_dealer_id()
  or id = (select authorized_dealer_id from dealerships where id = public.current_user_dealership_id())
);

drop policy if exists dealers_admin_write on authorized_dealers;
create policy dealers_admin_write on authorized_dealers for all
  using (public.is_admin()) with check (public.is_admin());

-- 6) Rewire installer visibility ------------------------------------------------
-- Installers see/serve the rooftops their DEALER services (any group).
drop policy if exists orders_select on orders;
create policy orders_select on orders for select using (
  public.is_admin()
  or (public.current_user_role() = 'installer' and exists (
        select 1 from dealerships d
        where d.id = orders.dealership_id
          and d.authorized_dealer_id is not null
          and d.authorized_dealer_id = public.current_user_dealer_id()))
  or (public.current_user_role() = 'dealership' and dealership_id = public.current_user_dealership_id())
);

drop policy if exists orders_update on orders;
create policy orders_update on orders for update using (
  public.is_admin()
  or (public.current_user_role() = 'installer' and exists (
        select 1 from dealerships d
        where d.id = orders.dealership_id
          and d.authorized_dealer_id is not null
          and d.authorized_dealer_id = public.current_user_dealer_id()))
  or (public.current_user_role() = 'dealership' and dealership_id = public.current_user_dealership_id())
);

drop policy if exists order_items_select on order_items;
create policy order_items_select on order_items for select using (
  exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and (
        public.is_admin()
        or (public.current_user_role() = 'installer' and exists (
              select 1 from dealerships d
              where d.id = o.dealership_id
                and d.authorized_dealer_id is not null
                and d.authorized_dealer_id = public.current_user_dealer_id()))
        or (public.current_user_role() = 'dealership' and o.dealership_id = public.current_user_dealership_id())
      )
  )
);

drop policy if exists status_history_select on order_status_history;
create policy status_history_select on order_status_history for select using (
  exists (
    select 1 from orders o
    where o.id = order_status_history.order_id
      and (
        public.is_admin()
        or (public.current_user_role() = 'installer' and exists (
              select 1 from dealerships d
              where d.id = o.dealership_id
                and d.authorized_dealer_id is not null
                and d.authorized_dealer_id = public.current_user_dealer_id()))
        or (public.current_user_role() = 'dealership' and o.dealership_id = public.current_user_dealership_id())
      )
  )
);

-- Installers can see the rooftops they service (needed for names in the queue).
drop policy if exists dealerships_select on dealerships;
create policy dealerships_select on dealerships for select using (
  public.is_admin()
  or group_id = public.current_user_group_id()
  or (authorized_dealer_id is not null and authorized_dealer_id = public.current_user_dealer_id())
);

-- Dealer colleagues can see each other (mirrors the group-colleague rule).
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select using (
  id = auth.uid()
  or public.is_admin()
  or (group_id is not null and group_id = public.current_user_group_id())
  or (authorized_dealer_id is not null and authorized_dealer_id = public.current_user_dealer_id())
);

-- Tell Supabase's API layer to pick everything up immediately.
notify pgrst, 'reload schema';
