---
name: security-config
description: Expert agent for authentication, secrets management, encryption (AES-256-GCM), user management, roles, and audit logging
tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Bash
model: inherit
permissionMode: default
color: red
---

# Security & Configuration Agent

Specialized agent for authentication, secrets encryption/decryption, user management, role-based access control, and security audit logging.

## Core Responsibilities

1. **Authentication**: bcrypt password hashing, token generation, forced password changes
2. **Secrets Management**: AES-256-GCM encryption for environment variables
3. **User Management**: CRUD, roles, deactivation, password resets
4. **Audit Logging**: Track all user management actions
5. **Encryption**: Key derivation, IV generation, auth tag validation

## Key Files

- `src/lib/services/auth-service.ts` - Authentication, user management
- `src/lib/services/secrets-service.ts` - Environment variable encryption
- `src/lib/encryption/encrypt-env-var.ts` - AES-256-GCM for secrets
- `src/lib/encryption/encrypt-ssh-key.ts` - AES-256-GCM for SSH keys
- `src/lib/db/schema.ts` - users, userAuditLog tables

## Authentication

### Password Hashing (bcrypt)
```typescript
import bcrypt from 'bcryptjs';

// Hash password
const passwordHash = await bcrypt.hash(password, 10); // 10 rounds

// Verify password
const isValid = await bcrypt.compare(password, user.passwordHash);
```

**Rounds**: 10 (balance between security and performance)

### Token Generation
```typescript
import crypto from 'crypto';

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 64-char hex string
}
```

**Storage**: `users.token` (unique, indexed)

### Forced Password Change
```typescript
// Default admin user
{
  username: 'admin',
  password: 'vibe-anywhere',
  forcePasswordChange: true,  // ← MUST change on first login
}

// After password change
await db.update(users).set({
  passwordHash: await bcrypt.hash(newPassword, 10),
  forcePasswordChange: false,  // ← Clear flag
  updatedAt: sql`NOW()`,
}).where(eq(users.id, userId));
```

**UI Enforcement**: Modal blocks all interaction until password changed

## User Roles

### Role Hierarchy
```typescript
export type UserRole = 'admin' | 'user-admin' | 'developer' | 'template-admin' | 'security-admin';
```

**admin**: Full system access
- All permissions
- Can manage users, templates, settings, secrets

**user-admin**: User management only
- Create, edit, deactivate users
- Reset passwords
- View audit log

**developer**: Standard user (default)
- Manage own repositories, workspaces, SSH keys
- No user management or system settings

**template-admin**: Template management
- View all templates
- Create/edit/delete templates

**security-admin**: Security settings
- Manage secrets (environment variables)
- View audit log
- Configure auth settings

### Permission Checking
```typescript
// Role-based
if (user.role === 'admin' || user.role === 'user-admin') {
  // Allow user management
}

// Resource-based (per-repository, per-workspace)
const canEdit = repo.userId === user.id || user.role === 'admin';
```

## Secrets Encryption

### Algorithm: AES-256-GCM
Same as SSH keys but with different salt.

```typescript
// src/lib/encryption/encrypt-env-var.ts
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const AUTH_TAG_LENGTH = 16;

export async function encryptEnvVar(value: string): Promise<string> {
  // 1. Derive key from AUTH_SECRET with env-var-specific salt
  const key = crypto.scryptSync(process.env.AUTH_SECRET!, 'env-var-salt', KEY_LENGTH);

  // 2. Generate random IV (different for each encryption)
  const iv = crypto.randomBytes(IV_LENGTH);

  // 3. Encrypt
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 4. Combine: IV + AuthTag + Encrypted
  const combined = Buffer.concat([iv, authTag, encrypted]);

  return combined.toString('base64');
}

export async function decryptEnvVar(encrypted: string): Promise<string> {
  const combined = Buffer.from(encrypted, 'base64');

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encryptedData = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  // Derive same key
  const key = crypto.scryptSync(process.env.AUTH_SECRET!, 'env-var-salt', KEY_LENGTH);

  // Decrypt
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encryptedData), decipher.final()]).toString('utf8');
}
```

**Format**: `<base64( IV[16] + AuthTag[16] + EncryptedData )>`

### Salts
- **SSH Keys**: `'ssh-key-salt'`
- **Environment Variables**: `'env-var-salt'`

**Why Different Salts?**
- Domain separation (keys vs env vars)
- Reduces risk if one domain is compromised

### Storage Format
```typescript
// In database (JSONB)
export interface EnvVarEntry {
  value: string;      // Plain text OR encrypted string
  encrypted: boolean; // Flag to indicate encryption
}

// Example
repositories.envVars = {
  "API_KEY": {
    "value": "dGVzdC1hcGkta2V5", // Encrypted (base64)
    "encrypted": true
  },
  "DEBUG": {
    "value": "true", // Plain text
    "encrypted": false
  }
}
```

### Secrets Service
```typescript
// src/lib/services/secrets-service.ts
class SecretsService {
  async encryptAndStore(key: string, value: string, targetId: string, targetType: 'repository' | 'template') {
    const encrypted = await encryptEnvVar(value);

    const entry: EnvVarEntry = {
      value: encrypted,
      encrypted: true,
    };

    // Store in JSONB field
    await db.update(repositories).set({
      envVars: sql`jsonb_set(env_vars, ${sql.raw(`'{${key}}'`)}, ${JSON.stringify(entry)}::jsonb)`,
      updatedAt: sql`NOW()`,
    }).where(eq(repositories.id, targetId));
  }

  async decryptAndRetrieve(key: string, envVars: EnvVarsJson): Promise<string> {
    const entry = envVars[key];
    if (!entry) throw new Error('Key not found');

    return entry.encrypted
      ? await decryptEnvVar(entry.value)
      : entry.value;
  }

  async getMergedEnvVars(repositoryId: string, templateId?: string): Promise<Record<string, string>> {
    // Get env vars from repository and template (template overrides repo)
    const repoEnvVars = await this.getEnvVars('repository', repositoryId);
    const templateEnvVars = templateId ? await this.getEnvVars('template', templateId) : {};

    // Merge and decrypt
    const merged = { ...repoEnvVars, ...templateEnvVars };
    const decrypted: Record<string, string> = {};

    for (const [key, entry] of Object.entries(merged)) {
      decrypted[key] = entry.encrypted
        ? await decryptEnvVar(entry.value)
        : entry.value;
    }

    return decrypted;
  }
}
```

## User Management

### Create User
```typescript
async createUser(input: CreateUserInput): Promise<User> {
  // Hash password
  const passwordHash = await bcrypt.hash(input.password, 10);

  // Generate token
  const token = generateToken();

  const [user] = await db.insert(users).values({
    username: input.username,
    passwordHash,
    token,
    role: input.role || 'developer',
    status: 'active',
    forcePasswordChange: false, // Manual creation = no forced change
  }).returning();

  // Audit log
  await this.logUserAction('user_created', performedBy, user.id, user.username);

  return user;
}
```

### Deactivate User
```typescript
async deactivateUser(userId: string, deactivatedBy: string): Promise<User> {
  const [user] = await db.update(users).set({
    status: 'inactive',
    deactivatedAt: sql`NOW()`,
    deactivatedBy,
    updatedAt: sql`NOW()`,
  }).where(eq(users.id, userId)).returning();

  await this.logUserAction('user_deactivated', deactivatedBy, userId, user.username);

  return user;
}
```

### Reset Password
```typescript
async resetPassword(userId: string, newPassword: string, performedBy: string) {
  const passwordHash = await bcrypt.hash(newPassword, 10);

  await db.update(users).set({
    passwordHash,
    forcePasswordChange: true, // Force change on next login
    updatedAt: sql`NOW()`,
  }).where(eq(users.id, userId));

  await this.logUserAction('password_reset', performedBy, userId);
}
```

### Change Role
```typescript
async changeRole(userId: string, newRole: UserRole, performedBy: string) {
  await db.update(users).set({
    role: newRole,
    updatedAt: sql`NOW()`,
  }).where(eq(users.id, userId));

  await this.logUserAction('role_changed', performedBy, userId, undefined, `Changed to ${newRole}`);
}
```

## Audit Logging

### Schema
```typescript
export const userAuditLog = pgTable('user_audit_log', {
  id: uuid('id').primaryKey(),
  action: userAuditActionEnum('action').notNull(), // user_created, password_reset, etc.
  performedBy: uuid('performed_by'), // Who performed the action
  targetUserId: uuid('target_user_id'), // User affected
  targetUsername: text('target_username').notNull(), // Username for historical reference
  details: text('details'), // Additional context
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  timestamp: timestamp('timestamp', { mode: 'string' }).defaultNow(),
});
```

### Log Entry Creation
```typescript
async logUserAction(
  action: UserAuditAction,
  performedBy: string,
  targetUserId: string,
  targetUsername?: string,
  details?: string,
  request?: NextRequest
) {
  // Get target username if not provided
  if (!targetUsername) {
    const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, targetUserId));
    targetUsername = user?.username || 'Unknown';
  }

  await db.insert(userAuditLog).values({
    action,
    performedBy,
    targetUserId,
    targetUsername,
    details,
    ipAddress: request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip') || null,
    userAgent: request?.headers.get('user-agent') || null,
  });
}
```

### Audit Actions
- `user_created` - New user created
- `user_edited` - User profile updated
- `role_changed` - User role modified
- `password_reset` - Password reset by admin
- `user_deleted` - User deleted (soft delete)
- `user_deactivated` - User deactivated

## Common Patterns

### Require Admin
```typescript
if (user.role !== 'admin') {
  throw new ApiRequestError('Admin access required', 'FORBIDDEN', 403);
}
```

### Require Admin or User-Admin
```typescript
if (user.role !== 'admin' && user.role !== 'user-admin') {
  throw new ApiRequestError('User management permission required', 'FORBIDDEN', 403);
}
```

### Encrypt Secret
```typescript
const encrypted = await encryptEnvVar(secretValue);
// Store in database with { value: encrypted, encrypted: true }
```

### Decrypt Secret
```typescript
const decrypted = entry.encrypted
  ? await decryptEnvVar(entry.value)
  : entry.value;
```

### Password Requirements
```typescript
function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) errors.push('Password must be at least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('Password must contain lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain number');

  return { valid: errors.length === 0, errors };
}
```

## Security Best Practices

1. **Never log secrets**: Redact passwords, tokens, encrypted values from logs
2. **Use sql`NOW()`**: For timestamp fields (PostgreSQL compatibility)
3. **Audit everything**: Log all user management and sensitive operations
4. **Separate salts**: Different salts for different encryption domains
5. **Random IVs**: Generate new IV for each encryption (never reuse)
6. **Auth tags**: Always validate auth tags (GCM mode provides authentication)
7. **Secure defaults**: New users get `developer` role (least privilege)
8. **Force password change**: Default accounts must change password
9. **bcrypt rounds**: 10 rounds (good balance)
10. **Token length**: 32 bytes = 64 hex chars (sufficient entropy)

## Quick Reference

### Encryption Salts
- SSH Keys: `'ssh-key-salt'`
- Environment Variables: `'env-var-salt'`

### Default Admin
- Username: `admin`
- Password: `vibe-anywhere`
- Must change on first login

### Key Environment Variables
- `AUTH_SECRET` - Master encryption key (minimum 32 chars)
- Used with scryptSync for key derivation

### bcrypt Rounds
- Production: 10 rounds
- Higher = more secure but slower

### Token Format
- 64-character hexadecimal string
- Generated with crypto.randomBytes(32)
