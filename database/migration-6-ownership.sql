-- =============================================================================
-- Migration 6 — Store Admins & Installer-Owned Packages (July 2026)
-- Powers portal update 16.
--
-- WHAT THIS ADDS
--   1. STORE ADMIN is now an explicit permission flag on each profile, not a
--      side effect of the person's title. Titles stay as reporting labels
--      (Top sellers / By department); the flag is what unlocks pricing,
--      discounts, and team management. Existing manager-titled users are
--      automatically granted the flag, so nothing breaks.
--   2. A database function claim_user_for_store() that assigns a freshly
--      created login to the calling store admin's own store — and FAILS
--      LOUDLY with a clear reason instead of silently doing nothing (the bug
--      where Team-added users stayed "Not assigned").
--   3. Store admins can manage teammates: change titles, names, and grant or
--      revoke the store-admin flag for people at their own store.
--   4. INSTALLER-OWNED PACKAGES: installers create their own packages (with
--      their wholesale) that are private to their shop, usable in their
--      programs, and visible to XPEL admin (who can edit anything). A package
--      with no retail price stays HIDDEN from the store's order screen until
--      a store admin (or XPEL) prices it.
--
-- HOW TO RUN
--   Supabase -> SQL Editor -> New query -> paste this WHOLE file -> Run.
--   Expect "Success. No rows returned." Safe to run more than once.
--   RUN THIS BEFORE uploading the update-16 code.
-- =============================================================================


-- ============================================================
-- 1) The Store Admin flag (permissions decoupled from titles)
-- ============================================================
alter table profiles add column if not exists is_store_admin boolean not null default false;

-- Grandfather everyone who already holds a management title, so the managers
-- you've set up keep their access the moment this runs.
update profiles set is_store_admin = true
where role = 'dealership'
  and is_store_admin = false
  and title in (
    'General Manager', 'General Sales Manager', 'Sales Manager',
    'Finance Manager', 'Fixed Operations Manager', 'Service Manager',
    'Used Car Sales Manager'
  );

-- Same function name every policy already calls — its meaning upgrades from
-- "has a manager title" to "holds the store-admin flag" in one place.
create or replace function public.is_store_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'dealership'
      and is_store_admin
  )
$$;

-- Guard v4: what non-admins can actually change on profiles.
--   • Anyone: their own name/title (assignment columns stay pinned).
--   • A store admin: (a) may CLAIM an unassigned account into their own store
--     (including granting the flag), and (b) may manage teammates at their own
--     store — titles, names, and the store-admin flag — but never role or
--     assignment.
--   • Everyone else: every privileged column silently stays as it was.
create or replace function public.guard_profile_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mgr_group uuid;
  mgr_store uuid;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if public.is_store_manager() then
    select group_id, dealership_id into mgr_group, mgr_store
    from profiles where id = auth.uid();

    -- (a) claim an unassigned, brand-new account into the admin's own store
    if old.role = 'dealership'
       and old.group_id is null and old.dealership_id is null and old.authorized_dealer_id is null
       and new.role = 'dealership'
       and new.group_id is not distinct from mgr_group
       and new.dealership_id is not distinct from mgr_store
       and new.authorized_dealer_id is null
    then
      return new;
    end if;

    -- (b) manage a teammate at the same store (or themselves): title, name,
    -- and the store-admin flag may change; role and assignment stay pinned.
    if old.dealership_id is not null and old.dealership_id = mgr_store then
      new.role                 := old.role;
      new.group_id             := old.group_id;
      new.dealership_id        := old.dealership_id;
      new.authorized_dealer_id := old.authorized_dealer_id;
      return new;
    end if;
  end if;

  new.role                 := old.role;
  new.group_id             := old.group_id;
  new.dealership_id        := old.dealership_id;
  new.authorized_dealer_id := old.authorized_dealer_id;
  new.is_store_admin       := old.is_store_admin;
  return new;
end $$;


-- ============================================================
-- 2) The loud, race-proof claim (fixes the "Not assigned" bug)
-- ============================================================
-- Assign a freshly signed-up login to the CALLER's store. Runs with definer
-- rights so row security can't silently swallow the update — every failure
-- raises a human-readable reason back to the Team screen.
create or replace function public.claim_user_for_store(
  p_user_id uuid,
  p_full_name text default null,
  p_title text default null,
  p_is_store_admin boolean default false
)
returns profiles
language plpgsql security definer set search_path = public as $$
declare
  mgr profiles%rowtype;
  t   profiles%rowtype;
begin
  select * into mgr from profiles where id = auth.uid();
  if mgr.id is null or mgr.role <> 'dealership' or not mgr.is_store_admin then
    raise exception 'Only store admins can add team members.';
  end if;
  if mgr.dealership_id is null then
    raise exception 'Your own account has no store assigned — ask XPEL to assign you first.';
  end if;

  select * into t from profiles where id = p_user_id for update;
  if t.id is null then
    raise exception 'The login was created but its profile has not appeared yet — try again in a moment.';
  end if;
  if t.role <> 'dealership'
     or t.group_id is not null or t.dealership_id is not null or t.authorized_dealer_id is not null
  then
    raise exception 'That account (%) is already assigned. Ask XPEL to move it if needed.',
      coalesce(t.email, p_user_id::text);
  end if;

  update profiles set
    full_name      = coalesce(nullif(trim(p_full_name), ''), full_name),
    title          = nullif(trim(coalesce(p_title, '')), ''),
    group_id       = mgr.group_id,
    dealership_id  = mgr.dealership_id,
    is_store_admin = coalesce(p_is_store_admin, false)
  where id = p_user_id
  returning * into t;

  return t;
end $$;

grant execute on function public.claim_user_for_store(uuid, text, text, boolean) to authenticated;


-- ============================================================
-- 3) Installer-owned packages
-- ============================================================
-- A package with NO retail price stays hidden from the store's order screen
-- until a store admin (or XPEL) prices it — so retail becomes optional.
alter table products alter column unit_price drop not null;

-- Who owns the package. Null = XPEL house package (everyone may use it).
alter table products add column if not exists authorized_dealer_id uuid references authorized_dealers(id) on delete set null;
create index if not exists products_owner_idx on products (authorized_dealer_id);

-- Installers see house packages + their own; stores see whatever is on their
-- program (owner-agnostic); XPEL admin sees everything.
drop policy if exists products_select on products;
create policy products_select on products for select using (
  public.is_admin()
  or (public.current_user_role() = 'installer'
      and (authorized_dealer_id is null or authorized_dealer_id = public.current_user_dealer_id()))
  or (public.current_user_role() = 'dealership' and public.dealership_can_see_product(id))
);

-- Writes: XPEL admin anywhere; an installer only on packages their shop owns.
drop policy if exists products_admin_write on products;
drop policy if exists products_write on products;
create policy products_write on products for all using (
  public.is_admin()
  or (authorized_dealer_id is not null and authorized_dealer_id = public.current_user_dealer_id())
) with check (
  public.is_admin()
  or (authorized_dealer_id is not null and authorized_dealer_id = public.current_user_dealer_id())
);

-- A program may only contain packages its owner may use: XPEL house packages
-- or the shop's own. (Keeps one installer's private packages out of another
-- installer's programs.)
create or replace function public.guard_program_product_source()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if not exists (
    select 1 from products p
    where p.id = new.product_id
      and (p.authorized_dealer_id is null
           or p.authorized_dealer_id = public.current_user_dealer_id())
  ) then
    raise exception 'You can only add XPEL house packages or your own shop''s packages to a program.';
  end if;
  return new;
end $$;

drop trigger if exists guard_program_product_source on program_products;
create trigger guard_program_product_source
  before insert or update on program_products
  for each row execute function public.guard_program_product_source();


-- Tell Supabase's API layer to pick everything up immediately.
notify pgrst, 'reload schema';
