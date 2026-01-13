PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`token` text,
	`role` text DEFAULT 'developer' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`force_password_change` integer DEFAULT false NOT NULL,
	`deactivated_at` integer,
	`deactivated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "username", "password_hash", "token", "role", "status", "force_password_change", "deactivated_at", "deactivated_by", "created_at", "updated_at") SELECT "id", "username", "password_hash", "token", "role", "status", "force_password_change", "deactivated_at", "deactivated_by", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_token_unique` ON `users` (`token`);