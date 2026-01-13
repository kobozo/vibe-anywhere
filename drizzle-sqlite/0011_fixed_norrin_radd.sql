CREATE TABLE `user_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`performed_by` text,
	`target_user_id` text,
	`target_username` text NOT NULL,
	`details` text,
	`ip_address` text,
	`user_agent` text,
	`timestamp` integer NOT NULL
);
