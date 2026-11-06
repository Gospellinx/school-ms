ALTER TABLE "kb_documents" ADD COLUMN "week" integer;--> statement-breakpoint
ALTER TABLE "kb_documents" ADD COLUMN "vetted_by" uuid;--> statement-breakpoint
ALTER TABLE "kb_documents" ADD COLUMN "vetted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kb_documents" ADD COLUMN "vet_comment" text;--> statement-breakpoint
ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_vetted_by_staff_id_fk" FOREIGN KEY ("vetted_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;