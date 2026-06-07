CREATE TABLE `context_studies` (
	`context_id` text NOT NULL,
	`study_id` text NOT NULL,
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`visit_id` text,
	`mode` text NOT NULL,
	`name` text,
	`last_modified` text,
	`annotations` text DEFAULT '[]',
	`tool_state` text DEFAULT '{}',
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `implants` (
	`id` text PRIMARY KEY NOT NULL,
	`context_id` text NOT NULL,
	`type` text NOT NULL,
	`fragment_id` text,
	`position` text,
	`angle` real,
	`properties` text,
	`timestamp` integer,
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`context_id` text NOT NULL,
	`tool_key` text NOT NULL,
	`fragment_id` text,
	`points` text,
	`result` text,
	`metadata` text,
	`timestamp` integer,
	FOREIGN KEY (`context_id`) REFERENCES `contexts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`age` integer,
	`gender` text,
	`dob` text,
	`contact` text,
	`last_visit` text,
	`has_alert` integer DEFAULT false,
	`is_archived` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`visit_id` text NOT NULL,
	`file_path` text NOT NULL,
	`title` text,
	`created_at` text,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `scans` (
	`id` text PRIMARY KEY NOT NULL,
	`study_id` text NOT NULL,
	`file_path` text NOT NULL,
	`type` text DEFAULT 'Imported',
	`date` text,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `studies` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`visit_id` text,
	`modality` text DEFAULT 'X-Ray',
	`source` text DEFAULT 'Import',
	`acquisition_date` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`visit_number` text,
	`date` text,
	`time` text,
	`diagnosis` text,
	`comments` text,
	`height` text,
	`weight` text,
	`consultants` text,
	`surgery_date` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
