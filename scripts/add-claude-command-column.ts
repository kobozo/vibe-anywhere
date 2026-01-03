import 'dotenv/config';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function migrate() {
  console.log('Adding claude_command column...');

  try {
    // Check if column exists
    const result = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'claude_command'
    `;

    if (result.length === 0) {
      await sql`ALTER TABLE sessions ADD COLUMN claude_command jsonb`;
      console.log('Column added successfully');
    } else {
      console.log('Column already exists');
    }
  } catch (error) {
    console.error('Failed to add column:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
