import { db } from '../src/lib/db/index.js';
import { workspaces } from '../src/lib/db/schema.js';
import { like } from 'drizzle-orm';

async function main() {
  const results = await db.select().from(workspaces).where(like(workspaces.hostname, '%be27f81f%')).limit(5);
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

main();
