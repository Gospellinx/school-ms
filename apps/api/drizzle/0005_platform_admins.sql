CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
-- School-scoped transactions run as school_app; platform accounts are not theirs to see.
REVOKE ALL ON "platform_admins" FROM school_app;
