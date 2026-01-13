CREATE TABLE `app_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_settings_key_unique` ON `app_settings` (`key`);--> statement-breakpoint
CREATE TABLE `git_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`git_name` text NOT NULL,
	`git_email` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `port_forwards` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`protocol` text NOT NULL,
	`host_port` integer NOT NULL,
	`container_port` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `proxmox_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`parent_template_id` text,
	`base_ct_template` text,
	`name` text NOT NULL,
	`description` text,
	`vmid` integer,
	`node` text,
	`storage` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`tech_stacks` text DEFAULT '[]',
	`inherited_tech_stacks` text DEFAULT '[]',
	`is_default` integer DEFAULT false NOT NULL,
	`error_message` text,
	`staging_container_ip` text,
	`env_vars` text DEFAULT '{}',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proxmox_templates_vmid_unique` ON `proxmox_templates` (`vmid`);--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`template_id` text,
	`ssh_key_id` text,
	`name` text NOT NULL,
	`description` text,
	`clone_url` text NOT NULL,
	`clone_depth` integer,
	`default_branch` text DEFAULT 'main',
	`tech_stack` text DEFAULT '[]',
	`env_vars` text DEFAULT '{}',
	`git_hooks` text DEFAULT '{}',
	`cached_branches` text DEFAULT '[]',
	`branches_cached_at` integer,
	`resource_memory` integer,
	`resource_cpu_cores` integer,
	`resource_disk_size` integer,
	`git_identity_id` text,
	`git_custom_name` text,
	`git_custom_email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `repository_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`secret_id` text NOT NULL,
	`include_in_env_file` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`secret_id`) REFERENCES `secrets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `repository_secrets_repo_id_idx` ON `repository_secrets` (`repository_id`);--> statement-breakpoint
CREATE INDEX `repository_secrets_secret_id_idx` ON `repository_secrets` (`secret_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_repo_secret` ON `repository_secrets` (`repository_id`,`secret_id`);--> statement-breakpoint
CREATE TABLE `secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`env_key` text NOT NULL,
	`value_encrypted` text NOT NULL,
	`description` text,
	`template_whitelist` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `secrets_user_id_idx` ON `secrets` (`user_id`);--> statement-breakpoint
CREATE TABLE `session_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`container_id` text,
	`container_status` text DEFAULT 'none' NOT NULL,
	`repo_path` text NOT NULL,
	`branch_name` text NOT NULL,
	`worktree_path` text,
	`base_commit` text,
	`claude_command` text,
	`output_buffer` text DEFAULT '[]',
	`output_buffer_size` integer DEFAULT 1000 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	`auto_shutdown_minutes` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ssh_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`repository_id` text,
	`name` text NOT NULL,
	`public_key` text NOT NULL,
	`private_key_encrypted` text NOT NULL,
	`key_type` text DEFAULT 'ed25519' NOT NULL,
	`fingerprint` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tab_group_members` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`tab_id` text NOT NULL,
	`pane_index` integer DEFAULT 0 NOT NULL,
	`size_percent` integer DEFAULT 50 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `tab_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tab_id`) REFERENCES `tabs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tab_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`layout` text DEFAULT 'horizontal' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tab_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`tab_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	FOREIGN KEY (`tab_id`) REFERENCES `tabs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tab_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT 'terminal',
	`command` text NOT NULL,
	`args` text DEFAULT '[]',
	`description` text,
	`exit_on_close` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_built_in` integer DEFAULT false NOT NULL,
	`required_tech_stack` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tabs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`tab_type` text DEFAULT 'terminal' NOT NULL,
	`icon` text,
	`is_pinned` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`command` text DEFAULT '["/bin/bash"]',
	`exit_on_close` integer DEFAULT false NOT NULL,
	`output_buffer` text DEFAULT '[]',
	`output_buffer_size` integer DEFAULT 1000 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	`auto_shutdown_minutes` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`token` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_token_unique` ON `users` (`token`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`template_id` text,
	`name` text NOT NULL,
	`branch_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`container_id` text,
	`container_status` text DEFAULT 'none' NOT NULL,
	`container_backend` text DEFAULT 'docker' NOT NULL,
	`container_ip` text,
	`has_uncommitted_changes` integer DEFAULT false NOT NULL,
	`agent_token` text,
	`agent_connected_at` integer,
	`agent_last_heartbeat` integer,
	`agent_version` text,
	`static_ip_address` text,
	`static_ip_gateway` text,
	`forced_vmid` integer,
	`override_template_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `proxmox_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`override_template_id`) REFERENCES `proxmox_templates`(`id`) ON UPDATE no action ON DELETE no action
);
