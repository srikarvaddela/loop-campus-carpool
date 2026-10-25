CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`ride_id` text NOT NULL,
	`rider_id` text NOT NULL,
	`rider_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`ride_id`) REFERENCES `rides`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_booking_per_rider` ON `bookings` (`ride_id`,`rider_id`);--> statement-breakpoint
CREATE TABLE `rides` (
	`id` text PRIMARY KEY NOT NULL,
	`driver_id` text NOT NULL,
	`driver_name` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`departure` text NOT NULL,
	`seats` integer NOT NULL,
	`price_cents` integer NOT NULL,
	`car` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rides_departure_idx` ON `rides` (`departure`);