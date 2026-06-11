CREATE TABLE "context_studies" (
	"context_id" text NOT NULL,
	"study_id" text NOT NULL,
	CONSTRAINT "context_studies_context_id_study_id_pk" PRIMARY KEY("context_id","study_id")
);
--> statement-breakpoint
CREATE TABLE "contexts" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"visit_id" text,
	"mode" text NOT NULL,
	"name" text,
	"last_modified" text,
	"annotations" text DEFAULT '[]',
	"tool_state" text DEFAULT '{}'
);
--> statement-breakpoint
CREATE TABLE "implants" (
	"id" text PRIMARY KEY NOT NULL,
	"context_id" text NOT NULL,
	"type" text NOT NULL,
	"fragment_id" text,
	"position" text,
	"angle" real,
	"properties" text,
	"timestamp" integer
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" text PRIMARY KEY NOT NULL,
	"context_id" text NOT NULL,
	"tool_key" text NOT NULL,
	"fragment_id" text,
	"points" text,
	"result" text,
	"metadata" text,
	"timestamp" integer
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"age" integer,
	"gender" text,
	"dob" text,
	"contact" text,
	"last_visit" text,
	"has_alert" boolean DEFAULT false,
	"is_archived" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"visit_id" text NOT NULL,
	"file_path" text NOT NULL,
	"title" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"file_path" text NOT NULL,
	"type" text DEFAULT 'Imported',
	"date" text
);
--> statement-breakpoint
CREATE TABLE "studies" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"visit_id" text,
	"modality" text DEFAULT 'X-Ray',
	"source" text DEFAULT 'Import',
	"acquisition_date" text
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"visit_number" text,
	"date" text,
	"time" text,
	"diagnosis" text,
	"comments" text,
	"height" text,
	"weight" text,
	"consultants" text,
	"surgery_date" text
);
--> statement-breakpoint
ALTER TABLE "context_studies" ADD CONSTRAINT "context_studies_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_studies" ADD CONSTRAINT "context_studies_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contexts" ADD CONSTRAINT "contexts_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contexts" ADD CONSTRAINT "contexts_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implants" ADD CONSTRAINT "implants_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;