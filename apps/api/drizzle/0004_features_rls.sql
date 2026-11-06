-- Tenant isolation for parents, attendance, fees, messaging, CBT and AI tables (same policy as 0001).

ALTER TABLE "guardians" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guardians" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "guardians_tenant_isolation" ON "guardians" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "student_guardians" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_guardians" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "student_guardians_tenant_isolation" ON "student_guardians" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "login_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "login_codes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "login_codes_tenant_isolation" ON "login_codes" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "result_publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "result_publications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "result_publications_tenant_isolation" ON "result_publications" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "attendance_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "attendance_records_tenant_isolation" ON "attendance_records" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "fee_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fee_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "fee_items_tenant_isolation" ON "fee_items" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invoices_tenant_isolation" ON "invoices" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invoice_lines_tenant_isolation" ON "invoice_lines" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "payments_tenant_isolation" ON "payments" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notifications_tenant_isolation" ON "notifications" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "questions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "questions_tenant_isolation" ON "questions" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "cbt_tests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cbt_tests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "cbt_tests_tenant_isolation" ON "cbt_tests" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "cbt_test_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cbt_test_questions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "cbt_test_questions_tenant_isolation" ON "cbt_test_questions" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "cbt_test_classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cbt_test_classes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "cbt_test_classes_tenant_isolation" ON "cbt_test_classes" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "cbt_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cbt_attempts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "cbt_attempts_tenant_isolation" ON "cbt_attempts" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "question_explanations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "question_explanations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "question_explanations_tenant_isolation" ON "question_explanations" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_usage_tenant_isolation" ON "ai_usage" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO school_app;
