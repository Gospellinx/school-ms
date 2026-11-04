-- Tenant isolation: every query must run inside a transaction that sets app.school_id.
-- FORCE makes the policies apply to the table owner too, so the app role cannot bypass them.

ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "staff_tenant_isolation" ON "staff" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sections_tenant_isolation" ON "sections" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "academic_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academic_sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "academic_sessions_tenant_isolation" ON "academic_sessions" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "terms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "terms" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "terms_tenant_isolation" ON "terms" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "classes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "classes_tenant_isolation" ON "classes" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subjects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "subjects_tenant_isolation" ON "subjects" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "class_subjects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "class_subjects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "class_subjects_tenant_isolation" ON "class_subjects" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "students" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "students_tenant_isolation" ON "students" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scores" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "scores_tenant_isolation" ON "scores" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "report_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "report_comments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "report_comments_tenant_isolation" ON "report_comments" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
