ALTER TABLE `users` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `deactivated_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `deactivated_by` text REFERENCES users(id);