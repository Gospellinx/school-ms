ALTER TYPE "public"."message_channel" ADD VALUE 'email';--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"step" integer,
	"invoice_id" uuid,
	"student_id" uuid,
	"guardian_id" uuid,
	"messages" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_settings" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"fee_due_days" integer DEFAULT 14 NOT NULL,
	"hold_allows_plans" boolean DEFAULT true NOT NULL,
	"weekly_report" boolean DEFAULT false NOT NULL,
	"weekly_day" integer DEFAULT 5 NOT NULL,
	"weekly_hour" integer DEFAULT 16 NOT NULL,
	"weekly_channels" jsonb DEFAULT '["preferred","email"]'::jsonb NOT NULL,
	"daily_summary" boolean DEFAULT false NOT NULL,
	"daily_hour" integer DEFAULT 18 NOT NULL,
	"digest_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"send_from" integer DEFAULT 7 NOT NULL,
	"send_until" integer DEFAULT 20 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"steps" jsonb NOT NULL,
	"threshold" integer,
	"enabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instalment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"schedule" jsonb NOT NULL,
	"paid_before_kobo" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_links" (
	"token" text PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_links_invoice_id_unique" UNIQUE("invoice_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD CONSTRAINT "automation_settings_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_sequences" ADD CONSTRAINT "follow_up_sequences_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instalment_plans" ADD CONSTRAINT "instalment_plans_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instalment_plans" ADD CONSTRAINT "instalment_plans_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instalment_plans" ADD CONSTRAINT "instalment_plans_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_links" ADD CONSTRAINT "pay_links_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_links" ADD CONSTRAINT "pay_links_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_run_key" ON "automation_runs" USING btree ("school_id","key");--> statement-breakpoint
CREATE INDEX "automation_runs_recent" ON "automation_runs" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sequence_school_trigger" ON "follow_up_sequences" USING btree ("school_id","trigger");--> statement-breakpoint
CREATE UNIQUE INDEX "instalment_plan_invoice" ON "instalment_plans" USING btree ("invoice_id");--> statement-breakpoint
ALTER TABLE "automation_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "automation_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "automation_settings_tenant_isolation" ON "automation_settings" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "follow_up_sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "follow_up_sequences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "follow_up_sequences_tenant_isolation" ON "follow_up_sequences" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "automation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "automation_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "automation_runs_tenant_isolation" ON "automation_runs" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "instalment_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "instalment_plans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "instalment_plans_tenant_isolation" ON "instalment_plans" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
-- Pay links are looked up by token before the school is known, so the owner connection must see them:
-- row-level security is on (not forced) and applies only to the school_app role.
ALTER TABLE "pay_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "pay_links_tenant_isolation" ON "pay_links" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "automation_settings", "follow_up_sequences", "automation_runs", "instalment_plans", "pay_links" TO school_app;
