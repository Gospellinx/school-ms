-- Full-text search over the school knowledge base, and tenant isolation for the AI learning tables (same policy as 0001).

ALTER TABLE "kb_chunks" ADD COLUMN "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("locator", '') || ' ' || "text")) STORED;--> statement-breakpoint
CREATE INDEX "kb_chunks_tsv" ON "kb_chunks" USING gin ("tsv");--> statement-breakpoint
ALTER TABLE "kb_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kb_documents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "kb_documents_tenant_isolation" ON "kb_documents" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "kb_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kb_files" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "kb_files_tenant_isolation" ON "kb_files" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "kb_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kb_chunks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "kb_chunks_tenant_isolation" ON "kb_chunks" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tutor_conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tutor_conversations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tutor_conversations_tenant_isolation" ON "tutor_conversations" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tutor_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tutor_messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tutor_messages_tenant_isolation" ON "tutor_messages" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "exam_goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exam_goals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "exam_goals_tenant_isolation" ON "exam_goals" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "kb_documents", "kb_files", "kb_chunks", "tutor_conversations", "tutor_messages", "exam_goals" TO school_app;
