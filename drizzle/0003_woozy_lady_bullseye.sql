CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bookings_capacity_idx` ON `bookings` (`ride_id`,`status`);--> statement-breakpoint
CREATE INDEX `rides_discovery_idx` ON `rides` (`status`,`departure`,`id`);--> statement-breakpoint
CREATE INDEX `rides_price_idx` ON `rides` (`status`,`price_cents`,`departure`,`id`);