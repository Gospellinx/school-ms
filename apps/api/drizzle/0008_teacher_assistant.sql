CREATE TYPE "public"."essay_script_status" AS ENUM('suggested', 'confirmed');--> statement-breakpoint
ALTER TYPE "public"."kb_kind" ADD VALUE 'lesson_plan' BEFORE 'past_questions';--> statement-breakpoint
CREATE TABLE "essay_scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"suggestion" jsonb,
	"awarded" double precision,
	"teacher_note" text,
	"status" "essay_script_status" DEFAULT 'suggested' NOT NULL,
	"marked_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "essay_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"term_id" uuid,
	"score_component" text,
	"title" text NOT NULL,
	"question" text NOT NULL,
	"rubric" jsonb NOT NULL,
	"max_marks" double precision NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "essay_scripts" ADD CONSTRAINT "essay_scripts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_scripts" ADD CONSTRAINT "essay_scripts_task_id_essay_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."essay_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_scripts" ADD CONSTRAINT "essay_scripts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_scripts" ADD CONSTRAINT "essay_scripts_marked_by_staff_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_tasks" ADD CONSTRAINT "essay_tasks_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_tasks" ADD CONSTRAINT "essay_tasks_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_tasks" ADD CONSTRAINT "essay_tasks_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_tasks" ADD CONSTRAINT "essay_tasks_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_tasks" ADD CONSTRAINT "essay_tasks_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "essay_script_task_student" ON "essay_scripts" USING btree ("task_id","student_id");--> statement-breakpoint
CREATE INDEX "essay_tasks_class" ON "essay_tasks" USING btree ("school_id","class_id");--> statement-breakpoint
ALTER TABLE "essay_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "essay_tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "essay_tasks_tenant_isolation" ON "essay_tasks" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "essay_scripts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "essay_scripts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "essay_scripts_tenant_isolation" ON "essay_scripts" USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid) WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "essay_tasks", "essay_scripts" TO school_app;
