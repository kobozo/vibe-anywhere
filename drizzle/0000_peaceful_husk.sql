CREATE TYPE "public"."container_backend" AS ENUM('docker', 'proxmox');--> statement-breakpoint
CREATE TYPE "public"."container_status" AS ENUM('none', 'creating', 'running', 'paused', 'exited', 'dead', 'removing');--> statement-breakpoint
CREATE TYPE "public"."port_forward_protocol" AS ENUM('http', 'tcp');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('pending', 'starting', 'running', 'stopping', 'stopped', 'error', 'restarting');--> statement-breakpoint
CREATE TYPE "public"."ssh_key_type" AS ENUM('ed25519', 'rsa', 'ecdsa');--> statement-breakpoint
CREATE TYPE "public"."tab_group_layout" AS ENUM('horizontal', 'vertical', 'left-stack', 'right-stack', 'grid-2x2');--> statement-breakpoint
CREATE TYPE "public"."tab_type" AS ENUM('terminal', 'git', 'docker', 'dashboard');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('pending', 'provisioning', 'staging', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."user_audit_action" AS ENUM('user_created', 'user_edited', 'role_changed', 'password_reset', 'user_deleted', 'user_deactivated');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user-admin', 'developer', 'template-admin', 'security-admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('pending', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "git_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"git_name" text NOT NULL,
	"git_email" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "port_forwards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"protocol" "port_forward_protocol" NOT NULL,
	"host_port" integer NOT NULL,
	"container_port" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proxmox_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_template_id" uuid,
	"base_ct_template" text,
	"name" text NOT NULL,
	"description" text,
	"vmid" integer,
	"node" text,
	"storage" text,
	"status" "template_status" DEFAULT 'pending' NOT NULL,
	"tech_stacks" jsonb DEFAULT '[]'::jsonb,
	"inherited_tech_stacks" jsonb DEFAULT '[]'::jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"staging_container_ip" text,
	"env_vars" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "proxmox_templates_vmid_unique" UNIQUE("vmid")
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"template_id" uuid,
	"ssh_key_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"clone_url" text NOT NULL,
	"clone_depth" integer,
	"default_branch" text DEFAULT 'main',
	"tech_stack" jsonb DEFAULT '[]'::jsonb,
	"env_vars" jsonb DEFAULT '{}'::jsonb,
	"git_hooks" jsonb DEFAULT '{}'::jsonb,
	"cached_branches" jsonb DEFAULT '[]'::jsonb,
	"branches_cached_at" timestamp,
	"resource_memory" integer,
	"resource_cpu_cores" integer,
	"resource_disk_size" integer,
	"git_identity_id" uuid,
	"git_custom_name" text,
	"git_custom_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"secret_id" uuid NOT NULL,
	"include_in_env_file" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_repo_secret" UNIQUE("repository_id","secret_id")
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"env_key" text NOT NULL,
	"value_encrypted" text NOT NULL,
	"description" text,
	"template_whitelist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"user_id" uuid NOT NULL,
	"status" "session_status" DEFAULT 'pending' NOT NULL,
	"container_id" text,
	"container_status" "container_status" DEFAULT 'none' NOT NULL,
	"repo_path" text NOT NULL,
	"branch_name" text NOT NULL,
	"worktree_path" text,
	"base_commit" text,
	"claude_command" text,
	"output_buffer" jsonb DEFAULT '[]'::jsonb,
	"output_buffer_size" integer DEFAULT 1000 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"auto_shutdown_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "ssh_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"repository_id" uuid,
	"name" text NOT NULL,
	"public_key" text NOT NULL,
	"private_key_encrypted" text NOT NULL,
	"key_type" "ssh_key_type" DEFAULT 'ed25519' NOT NULL,
	"fingerprint" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tab_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"tab_id" uuid NOT NULL,
	"pane_index" integer DEFAULT 0 NOT NULL,
	"size_percent" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tab_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"layout" "tab_group_layout" DEFAULT 'horizontal' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tab_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tab_id" uuid NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tab_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'terminal',
	"command" text NOT NULL,
	"args" jsonb DEFAULT '[]'::jsonb,
	"description" text,
	"exit_on_close" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"required_tech_stack" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tabs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "session_status" DEFAULT 'pending' NOT NULL,
	"tab_type" "tab_type" DEFAULT 'terminal' NOT NULL,
	"icon" text,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"command" jsonb DEFAULT '["/bin/bash"]'::jsonb,
	"exit_on_close" boolean DEFAULT false NOT NULL,
	"output_buffer" jsonb DEFAULT '[]'::jsonb,
	"output_buffer_size" integer DEFAULT 1000 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"auto_shutdown_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "user_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" "user_audit_action" NOT NULL,
	"performed_by" uuid,
	"target_user_id" uuid,
	"target_username" text NOT NULL,
	"details" text,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"token" text,
	"role" "user_role" DEFAULT 'developer' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"force_password_change" boolean DEFAULT false NOT NULL,
	"deactivated_at" timestamp,
	"deactivated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "workspace_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"shared_with_user_id" uuid NOT NULL,
	"shared_by_user_id" uuid NOT NULL,
	"permissions" jsonb DEFAULT '["view","execute"]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_workspace_share" UNIQUE("workspace_id","shared_with_user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"template_id" uuid,
	"name" text NOT NULL,
	"branch_name" text NOT NULL,
	"status" "workspace_status" DEFAULT 'pending' NOT NULL,
	"container_id" text,
	"container_status" "container_status" DEFAULT 'none' NOT NULL,
	"container_backend" "container_backend" DEFAULT 'proxmox' NOT NULL,
	"container_ip" text,
	"has_uncommitted_changes" boolean DEFAULT false NOT NULL,
	"agent_token" text,
	"agent_connected_at" timestamp,
	"agent_last_heartbeat" timestamp,
	"agent_version" text,
	"static_ip_address" text,
	"static_ip_gateway" text,
	"forced_vmid" integer,
	"override_template_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "git_identities" ADD CONSTRAINT "git_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "port_forwards" ADD CONSTRAINT "port_forwards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proxmox_templates" ADD CONSTRAINT "proxmox_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_secrets" ADD CONSTRAINT "repository_secrets_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_secrets" ADD CONSTRAINT "repository_secrets_secret_id_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "public"."secrets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_keys" ADD CONSTRAINT "ssh_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_keys" ADD CONSTRAINT "ssh_keys_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tab_group_members" ADD CONSTRAINT "tab_group_members_group_id_tab_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."tab_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tab_group_members" ADD CONSTRAINT "tab_group_members_tab_id_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "public"."tabs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tab_groups" ADD CONSTRAINT "tab_groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tab_logs" ADD CONSTRAINT "tab_logs_tab_id_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "public"."tabs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tab_templates" ADD CONSTRAINT "tab_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabs" ADD CONSTRAINT "tabs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_shares" ADD CONSTRAINT "workspace_shares_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_shares" ADD CONSTRAINT "workspace_shares_shared_with_user_id_users_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_shares" ADD CONSTRAINT "workspace_shares_shared_by_user_id_users_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_template_id_proxmox_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."proxmox_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_override_template_id_proxmox_templates_id_fk" FOREIGN KEY ("override_template_id") REFERENCES "public"."proxmox_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repository_secrets_repo_id_idx" ON "repository_secrets" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "repository_secrets_secret_id_idx" ON "repository_secrets" USING btree ("secret_id");--> statement-breakpoint
CREATE INDEX "secrets_user_id_idx" ON "secrets" USING btree ("user_id");