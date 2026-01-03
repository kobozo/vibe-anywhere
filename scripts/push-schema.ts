import 'dotenv/config';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function pushSchema() {
  console.log('Pushing database schema...');

  try {
    // Create enum types
    await sql`
      DO $$ BEGIN
        CREATE TYPE session_status AS ENUM ('pending', 'starting', 'running', 'stopping', 'stopped', 'error');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    await sql`
      DO $$ BEGIN
        CREATE TYPE container_status AS ENUM ('none', 'creating', 'running', 'paused', 'exited', 'dead', 'removing');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;

    console.log('Created enum types');

    // Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        token text UNIQUE,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `;
    console.log('Created users table');

    // Create sessions table
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        description text,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status session_status DEFAULT 'pending' NOT NULL,
        container_id text,
        container_status container_status DEFAULT 'none' NOT NULL,
        branch_name text NOT NULL,
        worktree_path text,
        base_commit text,
        output_buffer jsonb DEFAULT '[]'::jsonb,
        output_buffer_size integer DEFAULT 1000 NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
        auto_shutdown_minutes integer
      )
    `;
    console.log('Created sessions table');

    // Create session_logs table
    await sql`
      CREATE TABLE IF NOT EXISTS session_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        timestamp timestamp with time zone DEFAULT now() NOT NULL,
        type text NOT NULL,
        content text NOT NULL
      )
    `;
    console.log('Created session_logs table');

    console.log('Schema pushed successfully!');
  } catch (error) {
    console.error('Failed to push schema:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

pushSchema();
