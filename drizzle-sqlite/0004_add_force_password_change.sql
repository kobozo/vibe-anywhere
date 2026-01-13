-- Add force_password_change column to users table
ALTER TABLE `users` ADD COLUMN `force_password_change` integer DEFAULT 0 NOT NULL;
