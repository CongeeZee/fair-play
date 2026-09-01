-- Lock down the Supabase Data API (PostgREST) surface.
--
-- Fairplay uses Supabase purely as hosted Postgres. Every read and write goes
-- through the Express API via Prisma, which connects as `postgres` — a role
-- that both OWNS every table here and has BYPASSRLS. Nothing in this repo
-- imports supabase-js or calls /rest/v1, so the PostgREST surface has no
-- legitimate use; it was pure attack surface.
--
-- What was wrong: all 22 public tables had RLS disabled while `anon` and
-- `authenticated` held ALL privileges (SELECT/INSERT/UPDATE/DELETE/TRUNCATE).
-- The anon key is designed to be distributed publicly, so anyone holding it
-- could read User.email / User.passwordHash — or TRUNCATE any table — straight
-- off https://<project-ref>.supabase.co/rest/v1/. Supabase's linter reported
-- this as 22 `rls_disabled_in_public` ERRORs.
--
-- Enabling RLS with ZERO policies is a deliberate deny-all: PostgREST's roles
-- match no policy and see nothing. It is transparent to Prisma, which is both
-- owner and BYPASSRLS.
--
-- Two things this migration deliberately does NOT do:
--   * No FORCE ROW LEVEL SECURITY — that would apply RLS to the table owner,
--     which is precisely the role the API connects as.
--   * service_role is left untouched. It is a secret key (never shipped to a
--     client) and Supabase's own tooling relies on it.
--
-- Expect Supabase to now report 22 `rls_enabled_no_policy` notices at INFO.
-- That is the intended end state, not a regression: adding policies would
-- re-open access this app never wants. To silence them entirely, remove
-- `public` from the exposed schemas in Dashboard → Settings → API, which turns
-- the Data API off outright.
--
-- To reverse (only if you ever adopt the Supabase Data API): re-grant the
-- privileges, then write real per-table policies BEFORE dropping RLS.

-- 1. Enable RLS on every table in public. Looped rather than enumerated so no
--    table is missed and re-running stays harmless.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- 2. Defence in depth: drop the blanket grants themselves, so that a
--    permissive policy added by mistake later still exposes nothing.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END $$;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- 3. The durable half, and the reason this kept coming back: default
--    privileges on `postgres` granted ALL to anon/authenticated on every table
--    created in this schema. Each new Prisma migration silently reopened the
--    hole for its own tables. Without this step the fix decays on the next
--    `prisma migrate deploy`.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
