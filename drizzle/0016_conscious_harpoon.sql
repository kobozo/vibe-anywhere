ALTER TABLE "repositories" ADD COLUMN "cached_branches" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "branches_cached_at" timestamp with time zone;