CREATE TYPE "public"."kb_kind" AS ENUM('scheme_of_work', 'lesson_note', 'past_questions', 'textbook', 'marking_scheme', 'other');--> statement-breakpoint
CREATE TYPE "public"."kb_status" AS ENUM('processing', 'ready', 'needs_ai', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tutor_role" AS ENUM('student', 'tutor');--> statement-breakpoint
ALTER TYPE "public"."attempt_kind" ADD VALUE 'mock';--> statement-breakpoint
CREATE TABLE "exam_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"exam" "exam_tag" NOT NULL,
	"exam_date" date NOT NULL,
	"subject_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"locator" text,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "kb_kind" NOT NULL,
	"subject_id" uuid,
	"class_level" text,
	"term_number" integer,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "kb_status" DEFAULT 'processing' NOT NULL,
	"error" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"outline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visible_to_students" boolean DEFAULT true NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"data" "bytea" NOT NULL,
	CONSTRAINT "kb_files_document_id_unique" UNIQUE("document_id")
);
--> statement-breakpoint
CREATE TABLE "tutor_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic" text,
	"title" text NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "tutor_role" NOT NULL,
	"intent" text,
	"content" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quiz" jsonb,
	"quiz_answer" text,
	"quiz_correct" boolean,
	"safety" text,
	"source" text DEFAULT 'ai' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "cost_micro_usd" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cbt_attempts" ADD COLUMN "exam" "exam_tag";--> statement-breakpoint
ALTER TABLE "cbt_attempts" ADD COLUMN "mock" jsonb;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "ai_monthly_budget_cents" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "ai_student_daily_limit" integer;--> statement-breakpoint
ALTER TABLE "exam_goals" ADD CONSTRAINT "exam_goals_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_goals" ADD CONSTRAINT "exam_goals_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_document_id_kb_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."kb_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_uploaded_by_staff_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_files" ADD CONSTRAINT "kb_files_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_files" ADD CONSTRAINT "kb_files_document_id_kb_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."kb_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_conversation_id_tutor_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."tutor_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_goal_student_exam" ON "exam_goals" USING btree ("student_id","exam");--> statement-breakpoint
CREATE INDEX "kb_chunks_document" ON "kb_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "kb_documents_subject" ON "kb_documents" USING btree ("school_id","subject_id");--> statement-breakpoint
CREATE INDEX "tutor_conversations_student" ON "tutor_conversations" USING btree ("student_id","updated_at");--> statement-breakpoint
CREATE INDEX "tutor_messages_conversation" ON "tutor_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_school_month" ON "ai_usage" USING btree ("school_id","created_at");