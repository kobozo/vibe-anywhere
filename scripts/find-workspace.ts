import { db } from '../src/lib/db/index.js';
import { workspaces } from '../src/lib/db/schema.js';
import { like } from 'drizzle-orm';

async function main() {
  // Note: hostname column doesn't exist in schema, using name instead
  const results = await db.select().from(workspaces).where(like(workspaces.name, '%be27f81f%')).limit(5);
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

main();
