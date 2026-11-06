-- Real-time monitoring: tell listening API servers (LISTEN linx_live) when attendance, payments,
-- invoices, CBT sittings, AI usage or tutor safety flags change, so live dashboards update at once.
-- The payload is only the school and table; Postgres folds identical notifications in one
-- transaction, so saving a whole register sends one message.
CREATE OR REPLACE FUNCTION "linx_live_notify"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('linx_live', json_build_object('s', NEW.school_id, 't', TG_TABLE_NAME)::text);
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER "attendance_records_live" AFTER INSERT OR UPDATE ON "attendance_records" FOR EACH ROW EXECUTE FUNCTION "linx_live_notify"();--> statement-breakpoint
CREATE TRIGGER "payments_live" AFTER INSERT OR UPDATE ON "payments" FOR EACH ROW EXECUTE FUNCTION "linx_live_notify"();--> statement-breakpoint
CREATE TRIGGER "invoices_live" AFTER INSERT OR UPDATE ON "invoices" FOR EACH ROW EXECUTE FUNCTION "linx_live_notify"();--> statement-breakpoint
CREATE TRIGGER "cbt_attempts_live" AFTER INSERT OR UPDATE ON "cbt_attempts" FOR EACH ROW EXECUTE FUNCTION "linx_live_notify"();--> statement-breakpoint
CREATE TRIGGER "ai_usage_live" AFTER INSERT ON "ai_usage" FOR EACH ROW EXECUTE FUNCTION "linx_live_notify"();--> statement-breakpoint
CREATE TRIGGER "tutor_messages_live" AFTER INSERT ON "tutor_messages" FOR EACH ROW WHEN (NEW.safety IS NOT NULL) EXECUTE FUNCTION "linx_live_notify"();--> statement-breakpoint
CREATE TRIGGER "result_publications_live" AFTER INSERT ON "result_publications" FOR EACH ROW EXECUTE FUNCTION "linx_live_notify"();
