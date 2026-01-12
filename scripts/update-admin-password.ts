import { db, users } from '../src/lib/db/index.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function updateAdminPassword() {
  const passwordHash = await bcrypt.hash('admin123', 12);

  const result = await db.update(users)
    .set({ passwordHash, updatedAt: Date.now() })
    .where(eq(users.username, 'admin'));

  console.log('Admin password updated successfully!');
  console.log('Username: admin');
  console.log('Password: admin123');
}

updateAdminPassword().catch((error) => {
  console.error('Failed to update password:', error);
  process.exit(1);
});
