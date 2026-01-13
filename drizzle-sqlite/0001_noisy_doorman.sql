PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`template_id` text,
	`name` text NOT NULL,
	`branch_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`container_id` text,
	`container_status` text DEFAULT 'none' NOT NULL,
	`container_backend` text DEFAULT 'proxmox' NOT NULL,
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
--> statement-breakpoint
INSERT INTO `__new_workspaces`("id", "repository_id", "template_id", "name", "branch_name", "status", "container_id", "container_status", "container_backend", "container_ip", "has_uncommitted_changes", "agent_token", "agent_connected_at", "agent_last_heartbeat", "agent_version", "static_ip_address", "static_ip_gateway", "forced_vmid", "override_template_id", "created_at", "updated_at", "last_activity_at") SELECT "id", "repository_id", "template_id", "name", "branch_name", "status", "container_id", "container_status", "container_backend", "container_ip", "has_uncommitted_changes", "agent_token", "agent_connected_at", "agent_last_heartbeat", "agent_version", "static_ip_address", "static_ip_gateway", "forced_vmid", "override_template_id", "created_at", "updated_at", "last_activity_at" FROM `workspaces`;--> statement-breakpoint
DROP TABLE `workspaces`;--> statement-breakpoint
ALTER TABLE `__new_workspaces` RENAME TO `workspaces`;--> statement-breakpoint
PRAGMA foreign_keys=ON;