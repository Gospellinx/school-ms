-- Superusers and roles with BYPASSRLS ignore row-level security, even with FORCE.
-- The API therefore switches to this restricted role (SET LOCAL ROLE) inside every
-- school-scoped transaction, so isolation holds whichever role it connects as.
-- Needs a migrating role with CREATEROLE (or a superuser).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'school_app') THEN
    CREATE ROLE school_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
  -- The connecting role must be able to SET ROLE school_app. Superusers already can.
  IF NOT pg_has_role(current_user, 'school_app', 'MEMBER') THEN
    EXECUTE format('GRANT school_app TO %I', current_user);
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO school_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO school_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO school_app;
