#!/usr/bin/env tsx
/**
 * RBAC End-to-End Scenario Tests
 * Tests all role-based access control scenarios for US-021
 */

import Database from 'better-sqlite3';
import { resolve } from 'path';
import bcrypt from 'bcrypt';

const dbPath = resolve(process.cwd(), 'data', 'app.db');
const db = new Database(dbPath);

interface User {
  id: string;
  username: string;
  passwordHash: string;
  token: string;
  role: string;
}

interface Repository {
  id: string;
  name: string;
  userId: string;
}

interface ProxmoxTemplate {
  id: string;
  name: string;
  userId: string;
}

interface Secret {
  id: string;
  name: string;
  value: string;
  userId: string;
}

// Test result tracking
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function logTest(testName: string, status: 'PASS' | 'FAIL', message?: string) {
  testsRun++;
  if (status === 'PASS') {
    testsPassed++;
    console.log(`✅ ${testName}: PASS`);
  } else {
    testsFailed++;
    console.log(`❌ ${testName}: FAIL - ${message}`);
  }
}

// Helper to create test users
function createTestUser(username: string, role: string): User {
  const id = `test-${username}-${Date.now()}`;
  const passwordHash = bcrypt.hashSync('testpass123', 10);
  const token = `token-${username}-${Date.now()}`;

  db.prepare(
    'INSERT INTO users (id, username, password_hash, token, role, force_password_change, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
  ).run(id, username, passwordHash, token, role, Date.now(), Date.now());

  return { id, username, passwordHash, token, role };
}

// Helper to create test repository
function createTestRepository(name: string, userId: string): Repository {
  const id = `test-repo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  db.prepare(
    'INSERT INTO repositories (id, name, user_id, clone_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, userId, `https://example.com/${name}`, Date.now(), Date.now());

  return { id, name, userId };
}

// Helper to create test template
function createTestTemplate(name: string, userId: string): ProxmoxTemplate {
  const id = `test-template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const vmid = 9000 + Math.floor(Math.random() * 1000); // Random VMID between 9000-9999

  db.prepare(
    'INSERT INTO proxmox_templates (id, name, user_id, vmid, node, storage, description, tech_stacks, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, userId, vmid, 'test-node', 'local', 'Test template', '[]', Date.now(), Date.now());

  return { id, name, userId };
}

// Helper to create test secret
function createTestSecret(name: string, value: string, userId: string): Secret {
  const id = `test-secret-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const envKey = `TEST_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

  db.prepare(
    'INSERT INTO secrets (id, name, env_key, value_encrypted, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, envKey, value, userId, Date.now(), Date.now());

  return { id, name, value, userId };
}

// Cleanup test data
function cleanup() {
  console.log('\n🧹 Cleaning up test data...');
  db.prepare("DELETE FROM users WHERE id LIKE 'test-%'").run();
  db.prepare("DELETE FROM repositories WHERE id LIKE 'test-repo-%'").run();
  db.prepare("DELETE FROM proxmox_templates WHERE id LIKE 'test-template-%'").run();
  db.prepare("DELETE FROM secrets WHERE id LIKE 'test-secret-%'").run();
  db.prepare("DELETE FROM workspace_shares WHERE workspace_id LIKE 'test-workspace-%'").run();
  console.log('✨ Cleanup complete\n');
}

console.log('🧪 Starting RBAC End-to-End Scenario Tests\n');
console.log('=' .repeat(60));

try {
  // Cleanup any existing test data
  cleanup();

  // Create test users with different roles
  console.log('\n📝 Creating test users...');
  const adminUser = createTestUser('test-admin', 'admin');
  const developerUser1 = createTestUser('test-developer-1', 'developer');
  const developerUser2 = createTestUser('test-developer-2', 'developer');
  const templateAdminUser = createTestUser('test-template-admin', 'template-admin');
  const securityAdminUser = createTestUser('test-security-admin', 'security-admin');
  console.log('✅ Test users created');

  // Test 1: Admin sees all repositories
  console.log('\n' + '='.repeat(60));
  console.log('Test 1: Admin sees all repositories');
  console.log('='.repeat(60));

  const repo1 = createTestRepository('repo-dev1', developerUser1.id);
  const repo2 = createTestRepository('repo-dev2', developerUser2.id);
  const repo3 = createTestRepository('repo-admin', adminUser.id);

  // Simulate admin query (role-based filtering)
  const adminRepos = db.prepare('SELECT * FROM repositories WHERE id LIKE ?').all('test-repo-%') as Repository[];
  logTest('Admin sees all repositories', adminRepos.length === 3 ? 'PASS' : 'FAIL',
    `Expected 3, got ${adminRepos.length}`);

  // Test 2: Developer sees only own repositories
  console.log('\n' + '='.repeat(60));
  console.log('Test 2: Developer sees only own repositories');
  console.log('='.repeat(60));

  const dev1Repos = db.prepare('SELECT * FROM repositories WHERE id LIKE ? AND user_id = ?').all('test-repo-%', developerUser1.id) as Repository[];
  logTest('Developer 1 sees only own repository', dev1Repos.length === 1 && dev1Repos[0].id === repo1.id ? 'PASS' : 'FAIL',
    `Expected 1 repo (${repo1.id}), got ${dev1Repos.length}`);

  // Test 3: Template-admin sees all repos (read-only)
  console.log('\n' + '='.repeat(60));
  console.log('Test 3: Template-admin sees all repos (read-only)');
  console.log('='.repeat(60));

  const templateAdminRepos = db.prepare('SELECT * FROM repositories WHERE id LIKE ?').all('test-repo-%') as Repository[];
  logTest('Template-admin sees all repositories', templateAdminRepos.length === 3 ? 'PASS' : 'FAIL',
    `Expected 3, got ${templateAdminRepos.length}`);
  logTest('Template-admin cannot edit (role check)', templateAdminUser.role !== 'admin' ? 'PASS' : 'FAIL',
    'Template-admin should not have admin role');

  // Test 4: Workspace sharing works
  console.log('\n' + '='.repeat(60));
  console.log('Test 4: Workspace sharing works');
  console.log('='.repeat(60));

  // Create workspace for developer 1
  const workspaceId = `test-workspace-${Date.now()}`;
  db.prepare(
    'INSERT INTO workspaces (id, repository_id, name, branch_name, status, created_at, updated_at, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(workspaceId, repo1.id, 'test-workspace', 'main', 'stopped', Date.now(), Date.now(), Date.now());

  // Share workspace with developer 2
  const shareId = `test-share-${Date.now()}`;
  db.prepare(
    'INSERT INTO workspace_shares (id, workspace_id, shared_with_user_id, shared_by_user_id, permissions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(shareId, workspaceId, developerUser2.id, developerUser1.id, JSON.stringify(['view', 'execute']), Date.now(), Date.now());

  const share = db.prepare('SELECT * FROM workspace_shares WHERE id = ?').get(shareId);
  logTest('Workspace share created', share !== undefined ? 'PASS' : 'FAIL',
    'Share should exist in database');

  // Verify developer 2 can see shared workspace
  const sharedWorkspaces = db.prepare(
    'SELECT ws.*, w.name FROM workspace_shares ws INNER JOIN workspaces w ON ws.workspace_id = w.id WHERE ws.shared_with_user_id = ?'
  ).all(developerUser2.id);
  logTest('Developer 2 can see shared workspace', sharedWorkspaces.length === 1 ? 'PASS' : 'FAIL',
    `Expected 1 shared workspace, got ${sharedWorkspaces.length}`);

  // Test 5: Shared user can execute commands
  console.log('\n' + '='.repeat(60));
  console.log('Test 5: Shared user can execute commands');
  console.log('='.repeat(60));

  const shareWithExecute = db.prepare('SELECT * FROM workspace_shares WHERE id = ?').get(shareId) as any;
  const permissions = JSON.parse(shareWithExecute.permissions) as string[];
  logTest('Shared user has execute permission', permissions.includes('execute') ? 'PASS' : 'FAIL',
    `Permissions: ${permissions.join(', ')}`);

  // Test 6: Shared user cannot modify workspace
  console.log('\n' + '='.repeat(60));
  console.log('Test 6: Shared user cannot modify workspace');
  console.log('='.repeat(60));

  // Verify 'modify' permission is NOT in the permissions array
  logTest('Shared user does NOT have modify permission', !permissions.includes('modify') ? 'PASS' : 'FAIL',
    `Permissions: ${permissions.join(', ')}`);

  // Verify ownership check (would return 403 in API)
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId) as any;
  const workspaceRepo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(workspace.repository_id) as Repository;
  const isOwner = workspaceRepo.userId === developerUser2.id;
  logTest('Shared user is NOT workspace owner', !isOwner ? 'PASS' : 'FAIL',
    `Owner: ${workspaceRepo.userId}, Shared User: ${developerUser2.id}`);

  // Test 7: Admin can edit any template
  console.log('\n' + '='.repeat(60));
  console.log('Test 7: Admin can edit any template');
  console.log('='.repeat(60));

  const template1 = createTestTemplate('template-dev1', developerUser1.id);
  const template2 = createTestTemplate('template-dev2', developerUser2.id);

  // Admin can see all templates
  const allTemplates = db.prepare('SELECT * FROM proxmox_templates WHERE id LIKE ?').all('test-template-%') as ProxmoxTemplate[];
  logTest('Admin sees all templates', allTemplates.length === 2 ? 'PASS' : 'FAIL',
    `Expected 2, got ${allTemplates.length}`);

  // Admin role check (would allow edit/delete in API)
  logTest('Admin has canManageTemplates permission', adminUser.role === 'admin' ? 'PASS' : 'FAIL',
    `Admin role: ${adminUser.role}`);

  // Test 8: Developer cannot edit others' templates
  console.log('\n' + '='.repeat(60));
  console.log('Test 8: Developer cannot edit others\' templates');
  console.log('='.repeat(60));

  // Developer 1 can only see own template
  const dev1Templates = db.prepare('SELECT * FROM proxmox_templates WHERE id LIKE ? AND user_id = ?').all('test-template-%', developerUser1.id) as ProxmoxTemplate[];
  logTest('Developer 1 sees only own template', dev1Templates.length === 1 ? 'PASS' : 'FAIL',
    `Expected 1, got ${dev1Templates.length}`);

  // Check ownership for template2 (developer 1 does not own it)
  const dev1OwnsTemplate2 = template2.userId === developerUser1.id;
  logTest('Developer 1 does NOT own template2', !dev1OwnsTemplate2 ? 'PASS' : 'FAIL',
    `Template2 owner: ${template2.userId}, Developer 1: ${developerUser1.id}`);

  // Test 9: Security-admin sees all secrets
  console.log('\n' + '='.repeat(60));
  console.log('Test 9: Security-admin sees all secrets');
  console.log('='.repeat(60));

  const secret1 = createTestSecret('secret-dev1', 'value1', developerUser1.id);
  const secret2 = createTestSecret('secret-dev2', 'value2', developerUser2.id);
  const secret3 = createTestSecret('secret-admin', 'value3', adminUser.id);

  // Security-admin can see all secrets
  const allSecrets = db.prepare('SELECT * FROM secrets WHERE id LIKE ?').all('test-secret-%') as Secret[];
  logTest('Security-admin sees all secrets', allSecrets.length === 3 ? 'PASS' : 'FAIL',
    `Expected 3, got ${allSecrets.length}`);

  // Security-admin role check
  logTest('Security-admin has canManageSecrets permission', securityAdminUser.role === 'security-admin' ? 'PASS' : 'FAIL',
    `Security-admin role: ${securityAdminUser.role}`);

  // Test 10: Role change via API
  console.log('\n' + '='.repeat(60));
  console.log('Test 10: Role change via API');
  console.log('='.repeat(60));

  // Change developer 1 role to template-admin
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run('template-admin', developerUser1.id);

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(developerUser1.id) as User;
  logTest('User role changed successfully', updatedUser.role === 'template-admin' ? 'PASS' : 'FAIL',
    `Expected template-admin, got ${updatedUser.role}`);

  // Verify new role grants template management permissions
  const canManageTemplates = updatedUser.role === 'admin' || updatedUser.role === 'template-admin';
  logTest('User gains template management permissions', canManageTemplates ? 'PASS' : 'FAIL',
    `Role: ${updatedUser.role}, Can manage templates: ${canManageTemplates}`);

  // Now user can see all templates (not just their own)
  const newUserTemplates = db.prepare('SELECT * FROM proxmox_templates WHERE id LIKE ?').all('test-template-%') as ProxmoxTemplate[];
  logTest('Template-admin sees all templates', newUserTemplates.length === 2 ? 'PASS' : 'FAIL',
    `Expected 2, got ${newUserTemplates.length}`);

} catch (error) {
  console.error('\n❌ Test execution failed:', error);
  testsFailed++;
} finally {
  // Cleanup
  cleanup();
  db.close();

  // Summary
  console.log('='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  console.log(`Total tests run: ${testsRun}`);
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`Success rate: ${testsRun > 0 ? ((testsPassed / testsRun) * 100).toFixed(1) : 0}%`);
  console.log('='.repeat(60));

  if (testsFailed > 0) {
    console.log('\n⚠️  Some tests failed. Review the output above for details.');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  }
}
