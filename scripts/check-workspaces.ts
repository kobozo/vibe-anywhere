import Database from 'better-sqlite3';
import { resolve } from 'path';

const dbPath = resolve(process.cwd(), 'data/app.db');
const db = new Database(dbPath);

console.log('=== Workspaces ===');
try {
  const workspaces = db.prepare("SELECT id, name, status, created_at FROM workspaces").all();
  console.log('Total workspaces:', workspaces.length);
  if (workspaces.length > 0) {
    console.log('\nWorkspaces:');
    workspaces.forEach((w: any) => {
      console.log(`  - ${w.name} (${w.status}) created: ${new Date(w.created_at).toISOString()}`);
    });
  }
} catch (e: any) {
  console.log('Error:', e.message);
}

console.log('\n=== Tabs ===');
try {
  const tabs = db.prepare("SELECT id, workspace_id, name, tab_type FROM tabs").all();
  console.log('Total tabs:', tabs.length);
  if (tabs.length > 0) {
    console.log('\nTabs:');
    tabs.forEach((t: any) => {
      console.log(`  - ${t.name} (${t.tab_type}) workspace: ${t.workspace_id}`);
    });
  }
} catch (e: any) {
  console.log('Error:', e.message);
}

console.log('\n=== Repositories ===');
try {
  const repos = db.prepare("SELECT id, name, created_at FROM repositories").all();
  console.log('Total repositories:', repos.length);
  if (repos.length > 0) {
    console.log('\nRepositories:');
    repos.forEach((r: any) => {
      console.log(`  - ${r.name} created: ${new Date(r.created_at).toISOString()}`);
    });
  }
} catch (e: any) {
  console.log('Error:', e.message);
}

db.close();
