# XPEL Portal V3 — From Zero to Live (one clean pass)

V3 is structured so the deployment problems from V2 cannot recur: the app
lives at the top level of the repo (no subfolder to point at), and you upload
the whole thing exactly once. Follow this in order. ~25 minutes.

## Part 1 — Fresh database (Supabase, ~8 min)

1. supabase.com -> **New project**. Name: `xpel-portal-v3`. Save the database
   password. Pick a region near your dealers.
2. **SQL Editor -> New query** -> paste ALL of `database/schema.sql` -> **Run**.
3. New query -> paste ALL of `database/seed.sql` -> **Run**.
   (The seeded offerings are a starting point — edit or replace every one of
   them later in Admin -> Catalog & Pricing.)
4. **Authentication -> Providers -> Email** -> turn **Confirm email OFF** -> Save.
5. **Authentication -> Users -> Add user** -> your email + password,
   **Auto Confirm User checked** -> create.
6. SQL Editor -> New query -> run (with your email):
   ```sql
   update profiles set role='admin'
   where id = (select id from auth.users where email='YOU@xpel.com');
   ```
7. **Project Settings -> API** (or API Keys): copy the **Project URL**
   (https://…supabase.co) and the **publishable / anon** key — USE THE COPY
   BUTTONS, never highlight by hand (displayed keys are truncated with “…”).

## Part 2 — Fresh repo (GitHub, ~5 min)

1. github.com -> **New repository** -> name `xpel-portal-v3`, **Private**,
   create empty (no README).
2. On the empty-repo page click **“uploading an existing file.”**
3. Open the unzipped `v3` folder on your computer. Select EVERYTHING inside it
   and **drag it all in at once** (drag folders — don’t use “choose your files”).
   You should see paths like `src/App.jsx`, `database/schema.sql`, `index.html`.
4. **Commit changes.** Upload once, all together — that’s what keeps the repo clean.

## Part 3 — Fresh deploy (Vercel, ~5 min)

1. vercel.com -> **Add New -> Project** -> import `xpel-portal-v3`.
2. **Leave Root Directory alone** — the app is at the root now; nothing to set.
3. Framework auto-detects **Vite**. Add two Environment Variables:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your publishable/anon key
   (Values only. No quotes, no spaces.)
4. **Deploy.** Open the URL -> XPEL login screen -> sign in as your admin.
5. Back in Supabase: **Authentication -> URL Configuration** -> set **Site URL**
   to your Vercel URL.

## Part 4 — Run everything from inside the app

Log in as admin. From here on, no Supabase needed:
- **Users** — create accounts (email + temp password), assign role, group,
  rooftop; transfer people between stores; deactivate.
- **Network** — add dealer groups and rooftops, rename, delete (order history
  is protected).
- **Catalog & Pricing** — full autonomy: create/edit/retire offerings; every
  field is yours (name, category/type, tier, coverage text, price, cost).
  New categories automatically become new sections on the dealer order screen.
  Set private negotiated per-group prices.

The only jobs that intentionally stay in Supabase: permanently deleting a
login or resetting someone’s password (they require a secret server key that
must never live in a browser app — deactivation covers day-to-day needs).

## If something fails
- Build fails -> the upload missed folders; check the repo shows `src/` with
  files inside, re-drag anything missing.
- Blank page after deploy -> env-var values; re-copy both with the copy
  buttons, Save, **Redeploy**, retest in a private window.
- Still stuck -> F12 -> Console -> send the first red line to Claude.
