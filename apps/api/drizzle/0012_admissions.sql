CREATE TYPE "public"."application_status" AS ENUM('pending_payment', 'applied', 'exam', 'offered', 'accepted', 'enrolled', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."cbt_test_purpose" AS ENUM('class', 'entrance');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "admission_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"entrance_test_id" uuid,
	"pass_mark" integer,
	"seats" integer,
	"open" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applicant_exam_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	"question_ids" jsonb NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"score" double precision,
	"max_score" double precision,
	"percentage" double precision
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"detail" text,
	"staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"admission_class_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"status" "application_status" NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"other_names" text,
	"gender" "gender",
	"date_of_birth" date,
	"previous_school" text,
	"parent_name" text NOT NULL,
	"parent_email" text NOT NULL,
	"parent_phone" text NOT NULL,
	"relationship" text,
	"address" text,
	"notes" text,
	"fee_kobo" integer DEFAULT 0 NOT NULL,
	"fee_reference" text,
	"fee_paid_at" timestamp with time zone,
	"fee_method" text,
	"exam_test_id" uuid,
	"exam_opens_at" timestamp with time zone,
	"exam_closes_at" timestamp with time zone,
	"exam_percentage" double precision,
	"offer_note" text,
	"offered_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"decision_note" text,
	"decided_by" uuid,
	"student_id" uuid,
	"enrolled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_fee_reference_unique" UNIQUE("fee_reference")
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"kind" text NOT NULL,
	"application_id" uuid,
	"only_if_status" text,
	"send_after" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_ref" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "school_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"tagline" text,
	"about" text,
	"hero_image_url" text,
	"logo_url" text,
	"accent_color" text,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gallery" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"whatsapp" text,
	"map_url" text,
	"admissions_open" boolean DEFAULT false NOT NULL,
	"admission_session" text,
	"application_fee_kobo" integer DEFAULT 0 NOT NULL,
	"admission_instructions" text,
	"admissions_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_sites_school_id_unique" UNIQUE("school_id")
);
--> statement-breakpoint
ALTER TABLE "cbt_tests" ADD COLUMN "purpose" "cbt_test_purpose" DEFAULT 'class' NOT NULL;--> statement-breakpoint
ALTER TABLE "admission_classes" ADD CONSTRAINT "admission_classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_classes" ADD CONSTRAINT "admission_classes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_classes" ADD CONSTRAINT "admission_classes_entrance_test_id_cbt_tests_id_fk" FOREIGN KEY ("entrance_test_id") REFERENCES "public"."cbt_tests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_exam_attempts" ADD CONSTRAINT "applicant_exam_attempts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_exam_attempts" ADD CONSTRAINT "applicant_exam_attempts_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_exam_attempts" ADD CONSTRAINT "applicant_exam_attempts_test_id_cbt_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."cbt_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_admission_class_id_admission_classes_id_fk" FOREIGN KEY ("admission_class_id") REFERENCES "public"."admission_classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_exam_test_id_cbt_tests_id_fk" FOREIGN KEY ("exam_test_id") REFERENCES "public"."cbt_tests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_decided_by_staff_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_sites" ADD CONSTRAINT "school_sites_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admission_class_unique" ON "admission_classes" USING btree ("school_id","class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applicant_attempt_unique" ON "applicant_exam_attempts" USING btree ("application_id","test_id");--> statement-breakpoint
CREATE INDEX "application_events_recent" ON "application_events" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE INDEX "application_events_app" ON "application_events" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_school_reference" ON "applications" USING btree ("school_id","reference");--> statement-breakpoint
CREATE INDEX "applications_status" ON "applications" USING btree ("school_id","status","created_at");--> statement-breakpoint
CREATE INDEX "email_outbox_due" ON "email_outbox" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "email_outbox_application" ON "email_outbox" USING btree ("application_id");--> statement-breakpoint
-- Tenant isolation for the website and admissions tables (same policy as 0001).
ALTER TABLE "school_sites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "school_sites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "school_sites_tenant_isolation" ON "school_sites" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "admission_classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admission_classes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "admission_classes_tenant_isolation" ON "admission_classes" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "applications_tenant_isolation" ON "applications" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "application_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "application_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "application_events_tenant_isolation" ON "application_events" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "applicant_exam_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applicant_exam_attempts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "applicant_exam_attempts_tenant_isolation" ON "applicant_exam_attempts" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "email_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_outbox" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "email_outbox_tenant_isolation" ON "email_outbox" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO school_app;
