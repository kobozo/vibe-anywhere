-- Add role column to users table
ALTER TABLE `users` ADD COLUMN `role` text DEFAULT 'developer' NOT NULL;
--> statement-breakpoint

-- Set admin user to have admin role
UPDATE users SET role = 'admin' WHERE username = 'admin';
--> statement-breakpoint

-- Create workspace_shares table for workspace collaboration
CREATE TABLE `workspace_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`shared_with_user_id` text NOT NULL,
	`shared_by_user_id` text NOT NULL,
	`permissions` text DEFAULT '["view","execute"]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shared_with_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

CREATE UNIQUE INDEX `unique_workspace_share` ON `workspace_shares` (`workspace_id`,`shared_with_user_id`);
