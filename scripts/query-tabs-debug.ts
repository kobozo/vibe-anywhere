import { db, dbConfig } from '../src/lib/db/index';
import { tabs } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

const workspaceId = '3e4458eb-8821-4ab9-a937-afe82812ca5f';

console.log(`Using database backend: ${dbConfig.backend}`);
console.log(`Connection string: ${dbConfig.connectionString}`);

db.select().from(tabs).where(eq(tabs.workspaceId, workspaceId)).then((result) => {
  console.log('Found tabs:', result.length);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}).catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
