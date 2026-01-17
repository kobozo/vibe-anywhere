---
name: git-repository
description: Expert agent for Git operations, SSH key management, branch caching, repository configuration, and git identity handling
tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Bash
model: inherit
permissionMode: default
color: orange
---

# Git & Repository Agent

Specialized agent for Git operations, SSH key encryption/decryption, git identities, branch caching, and repository management.

## Core Responsibilities

1. **SSH Key Management**: Encryption/decryption (AES-256-GCM), key generation, fingerprinting
2. **Git Identities**: Named git configurations (user.name, user.email) for commits
3. **Branch Caching**: Fetching and caching remote branches via `git ls-remote`
4. **Repository Operations**: Clone configuration, shallow clones, default branches
5. **Git Hooks**: Base64-encoded hooks injected into containers

## Key Files

- `src/lib/services/git-service.ts` - Deprecated (legacy worktree logic)
- `src/lib/services/git-identity-service.ts` - Git identity CRUD
- `src/lib/services/remote-git-service.ts` - Remote operations (ls-remote)
- `src/lib/services/ssh-key-service.ts` - SSH key encryption/decryption
- `src/lib/encryption/encrypt-ssh-key.ts` - AES-256-GCM encryption
- `src/lib/container/proxmox/ssh-stream.ts` - Git operations in containers

## SSH Key Encryption

### Algorithm: AES-256-GCM
```typescript
// src/lib/encryption/encrypt-ssh-key.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const AUTH_TAG_LENGTH = 16;

export async function encryptPrivateKey(privateKey: string): Promise<string> {
  // 1. Derive encryption key from AUTH_SECRET
  const key = crypto.scryptSync(process.env.AUTH_SECRET!, 'ssh-key-salt', KEY_LENGTH);

  // 2. Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // 3. Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // 4. Encrypt
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final(),
  ]);

  // 5. Get auth tag
  const authTag = cipher.getAuthTag();

  // 6. Combine: IV + AuthTag + Encrypted
  const combined = Buffer.concat([iv, authTag, encrypted]);

  return combined.toString('base64');
}

export async function decryptPrivateKey(encryptedKey: string): Promise<string> {
  const combined = Buffer.from(encryptedKey, 'base64');

  // 1. Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  // 2. Derive same key
  const key = crypto.scryptSync(process.env.AUTH_SECRET!, 'ssh-key-salt', KEY_LENGTH);

  // 3. Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  // 4. Decrypt
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
```

**Format**: `<base64( IV[16] + AuthTag[16] + EncryptedData )>`

### SSH Key Types
- **ed25519** - Recommended (small, fast, secure)
- **rsa** - Traditional (2048+ bits)
- **ecdsa** - Elliptic curve (256/384/521 bits)

### Fingerprint Calculation
```typescript
import crypto from 'crypto';

function calculateFingerprint(publicKey: string): string {
  // Remove header/footer and decode base64
  const keyData = publicKey
    .replace(/-----BEGIN.*KEY-----/, '')
    .replace(/-----END.*KEY-----/, '')
    .replace(/\s/g, '');

  const hash = crypto.createHash('sha256').update(Buffer.from(keyData, 'base64')).digest();
  return `SHA256:${hash.toString('base64').replace(/=+$/, '')}`;
}
```

## Git Identities

### Purpose
Named git configurations for different contexts (work, personal, client projects).

### Database Schema
```typescript
// src/lib/db/schema.ts
export const gitIdentities = pgTable('git_identities', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // Display: "Work", "Personal"
  gitName: text('git_name').notNull(), // Git config: user.name
  gitEmail: text('git_email').notNull(), // Git config: user.email
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow(),
});
```

### Usage in Repository
```typescript
// Repository can use:
// 1. Saved git identity (FK to gitIdentities)
repositories.gitIdentityId

// 2. Custom values (one-off configuration)
repositories.gitCustomName
repositories.gitCustomEmail

// Priority: gitIdentityId > custom values > agent defaults
```

### Agent Configuration
```typescript
// packages/agent/src/git-handler.ts
socket.on('git:config', async (data: { name: string; email: string }) => {
  const git = simpleGit('/workspace');
  await git.addConfig('user.name', data.name);
  await git.addConfig('user.email', data.email);
  console.log(`Git configured: ${data.name} <${data.email}>`);
});
```

## Branch Caching

### Purpose
Avoid expensive `git ls-remote` calls on every page load. Cache branches and refresh periodically.

### Remote Service
```typescript
// src/lib/services/remote-git-service.ts
async fetchRemoteBranches(repoId: string): Promise<string[]> {
  const repo = await getRepository(repoId);

  // Get SSH key for private repos
  let sshKeyContent: string | undefined;
  if (repo.sshKeyId) {
    sshKeyContent = await sshKeyService.getDecryptedPrivateKey(repo.sshKeyId);
  }

  // Fetch branches via git ls-remote
  const branches = await gitLsRemote(repo.cloneUrl, sshKeyContent);

  // Cache in database
  await db.update(repositories).set({
    cachedBranches: branches,
    branchesCachedAt: sql`NOW()`,
    updatedAt: sql`NOW()`,
  }).where(eq(repositories.id, repoId));

  return branches;
}
```

### Git ls-remote Implementation
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

async function gitLsRemote(repoUrl: string, sshKey?: string): Promise<string[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ls-remote-'));

  try {
    let sshCommand = 'ssh -o StrictHostKeyChecking=no';

    // Write SSH key to temp file if provided
    if (sshKey) {
      const keyPath = path.join(tmpDir, 'id_key');
      await fs.writeFile(keyPath, sshKey, { mode: 0o600 });
      sshCommand += ` -i ${keyPath}`;
    }

    // Run git ls-remote
    const { stdout } = await execAsync(`git ls-remote --heads "${repoUrl}"`, {
      env: { ...process.env, GIT_SSH_COMMAND: sshCommand },
    });

    // Parse output: "hash\trefs/heads/branch-name"
    const branches = stdout
      .split('\n')
      .filter(line => line.includes('refs/heads/'))
      .map(line => line.split('refs/heads/')[1])
      .filter(Boolean);

    return branches;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
```

## Git Hooks

### Storage Format
Hooks stored as JSONB in database, base64-encoded:
```typescript
export interface GitHookEntry {
  content: string;      // Base64-encoded hook script
  executable: boolean;  // Whether to chmod +x
}
export type GitHooksJson = Record<string, GitHookEntry>;

// Example
{
  "pre-commit": {
    "content": "IyEvYmluL2Jhc2gKbnBtIHJ1biBsaW50",  // #!/bin/bash\nnpm run lint
    "executable": true
  }
}
```

### Injection into Container
```typescript
// src/lib/services/git-hooks-service.ts
async writeHooksToContainer(containerIp: string, hooks: GitHooksJson) {
  for (const [hookName, hook] of Object.entries(hooks)) {
    const hookPath = `/workspace/.git/hooks/${hookName}`;
    const content = Buffer.from(hook.content, 'base64').toString('utf8');

    await execSSHCommand(
      { host: containerIp, username: 'kobozo' },
      ['bash', '-c', `cat > ${hookPath} << 'HOOK_EOF'\n${content}\nHOOK_EOF`]
    );

    if (hook.executable) {
      await execSSHCommand(
        { host: containerIp, username: 'kobozo' },
        ['chmod', '+x', hookPath]
      );
    }
  }
}
```

## Repository Configuration

### Clone Settings
```typescript
// Shallow clone (saves bandwidth/disk for large repos)
repositories.cloneDepth = 50;  // Last 50 commits
repositories.cloneDepth = null; // Full clone

// Default branch
repositories.defaultBranch = 'main';

// Clone URL (HTTPS or SSH)
repositories.cloneUrl = 'git@github.com:user/repo.git';
repositories.cloneUrl = 'https://github.com/user/repo.git';
```

### Cloning in Container
```typescript
// src/lib/container/proxmox/ssh-stream.ts
export async function gitCloneInContainer(
  containerIp: string,
  options: {
    url: string;
    branch: string;
    depth?: number;
    sshKeyContent?: string;
  }
) {
  // 1. Setup SSH key if provided
  if (options.sshKeyContent) {
    await syncSSHKeyToContainer(containerIp, options.sshKeyContent);
  }

  // 2. Build clone command
  let cloneCmd = `git clone --branch ${options.branch}`;
  if (options.depth) {
    cloneCmd += ` --depth ${options.depth}`;
  }
  cloneCmd += ` ${options.url} /workspace`;

  // 3. Execute via SSH
  await execSSHCommand(
    { host: containerIp, username: 'kobozo' },
    ['bash', '-c', cloneCmd],
    { workingDir: '/home/kobozo' }
  );
}
```

## Common Patterns

### Create SSH Key
```typescript
const newKey = await sshKeyService.generateKey({
  name: 'GitHub Deploy Key',
  keyType: 'ed25519',
  userId: user.id,
});
// Returns: { publicKey, privateKeyEncrypted, fingerprint }
```

### Refresh Branches
```typescript
const remoteGitService = getRemoteGitService();
const branches = await remoteGitService.fetchRemoteBranches(repositoryId);
// Caches in DB, returns branch names
```

### Create Git Identity
```typescript
const identity = await gitIdentityService.createIdentity(userId, {
  name: 'Work',
  gitName: 'John Doe',
  gitEmail: 'john@company.com',
  isDefault: true,
});
```

### Apply Git Identity to Repo
```typescript
// Use saved identity
await db.update(repositories).set({
  gitIdentityId: identity.id,
  gitCustomName: null,
  gitCustomEmail: null,
}).where(eq(repositories.id, repoId));

// OR use custom values
await db.update(repositories).set({
  gitIdentityId: null,
  gitCustomName: 'Custom Name',
  gitCustomEmail: 'custom@email.com',
}).where(eq(repositories.id, repoId));
```

## Quick Reference

### SSH Key Salt
- **Encryption salt**: `'ssh-key-salt'`
- **Purpose**: Unique salt for SSH key encryption (separate from env var encryption)

### Supported Hooks
- `pre-commit`, `prepare-commit-msg`, `commit-msg`, `post-commit`
- `pre-push`, `post-checkout`, `post-merge`

### Git Operations Location
- **Server-side**: Branch caching, SSH key management
- **Container-side** (via agent): Git commands, hook execution

### Key Environment Variables
- `AUTH_SECRET` - Master key for encryption (scrypt derivation)
- `GIT_SSH_COMMAND` - Custom SSH command for git operations
