/**
 * Migration script: Session Hub v1 → v2
 *
 * Creates new tables for the hierarchical model:
 * - repositories
 * - workspaces
 * - tabs
 * - ssh_keys
 * - tab_logs
 *
 * Run with: npx tsx scripts/migrate-to-v2.ts
 */

import 'dotenv/config';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function migrate() {
  console.log('Starting migration to v2 schema...\n');

  try {
    // Create new enums
    console.log('Creating new enums...');

    await sql`
      DO $$ BEGIN
        CREATE TYPE workspace_status AS ENUM ('pending', 'active', 'archived');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    await sql`
      DO $$ BEGIN
        CREATE TYPE repo_source_type AS ENUM ('local', 'cloned');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    await sql`
      DO $$ BEGIN
        CREATE TYPE ssh_key_type AS ENUM ('ed25519', 'rsa', 'ecdsa');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    console.log('✓ Enums created\n');

    // Create repositories table
    console.log('Creating repositories table...');
    await sql`
      CREATE TABLE IF NOT EXISTS repositories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        path TEXT NOT NULL,
        original_path TEXT,
        source_type repo_source_type DEFAULT 'local' NOT NULL,
        clone_url TEXT,
        default_branch TEXT DEFAULT 'main',
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
      )
    `;
    console.log('✓ repositories table created\n');

    // Create workspaces table
    console.log('Creating workspaces table...');
    await sql`
      CREATE TABLE IF NOT EXISTS workspaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        worktree_path TEXT,
        base_commit TEXT,
        status workspace_status DEFAULT 'pending' NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        last_activity_at TIMESTAMPTZ DEFAULT now() NOT NULL
      )
    `;
    console.log('✓ workspaces table created\n');

    // Create tabs table
    console.log('Creating tabs table...');
    await sql`
      CREATE TABLE IF NOT EXISTS tabs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status session_status DEFAULT 'pending' NOT NULL,
        container_id TEXT,
        container_status container_status DEFAULT 'none' NOT NULL,
        claude_command JSONB,
        output_buffer JSONB DEFAULT '[]'::jsonb,
        output_buffer_size INTEGER DEFAULT 1000 NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        last_activity_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        auto_shutdown_minutes INTEGER
      )
    `;
    console.log('✓ tabs table created\n');

    // Create ssh_keys table
    console.log('Creating ssh_keys table...');
    await sql`
      CREATE TABLE IF NOT EXISTS ssh_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        public_key TEXT NOT NULL,
        private_key_encrypted TEXT NOT NULL,
        key_type ssh_key_type DEFAULT 'ed25519' NOT NULL,
        fingerprint TEXT NOT NULL,
        is_default BOOLEAN DEFAULT false NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT user_or_repo CHECK (user_id IS NOT NULL OR repository_id IS NOT NULL)
      )
    `;
    console.log('✓ ssh_keys table created\n');

    // Create tab_logs table
    console.log('Creating tab_logs table...');
    await sql`
      CREATE TABLE IF NOT EXISTS tab_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tab_id UUID NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
        timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL
      )
    `;
    console.log('✓ tab_logs table created\n');

    // Create indexes for better performance
    console.log('Creating indexes...');

    await sql`CREATE INDEX IF NOT EXISTS idx_repositories_user_id ON repositories(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_workspaces_repository_id ON workspaces(repository_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tabs_workspace_id ON tabs(workspace_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_ssh_keys_user_id ON ssh_keys(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_ssh_keys_repository_id ON ssh_keys(repository_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tab_logs_tab_id ON tab_logs(tab_id)`;

    console.log('✓ Indexes created\n');

    console.log('========================================');
    console.log('Migration to v2 completed successfully!');
    console.log('========================================');
    console.log('\nNew tables created:');
    console.log('  - repositories');
    console.log('  - workspaces');
    console.log('  - tabs');
    console.log('  - ssh_keys');
    console.log('  - tab_logs');
    console.log('\nLegacy tables preserved:');
    console.log('  - sessions (can be removed after data migration)');
    console.log('  - session_logs');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
