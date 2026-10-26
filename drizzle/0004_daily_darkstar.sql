CREATE TABLE `message_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`reporter_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`moderator_id` text,
	`resolution_notes` text,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_report_per_user_message` ON `message_reports` (`message_id`,`reporter_id`);--> statement-breakpoint
CREATE INDEX `message_reports_status_idx` ON `message_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `ride_appeals` (
	`id` text PRIMARY KEY NOT NULL,
	`ride_id` text NOT NULL,
	`removal_report_id` text NOT NULL,
	`driver_id` text NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decision_notes` text,
	`reviewer_id` text,
	`created_at` text NOT NULL,
	`reviewed_at` text,
	FOREIGN KEY (`ride_id`) REFERENCES `rides`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_appeal_per_removal` ON `ride_appeals` (`ride_id`,`removal_report_id`);--> statement-breakpoint
CREATE INDEX `appeals_status_idx` ON `ride_appeals` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `messages` ADD `hidden_at` text;--> statement-breakpoint
ALTER TABLE `rides` ADD `removal_report_id` text;