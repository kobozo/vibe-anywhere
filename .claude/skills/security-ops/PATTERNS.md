# Security Patterns

## Password Hashing
```typescript
// Hash
const passwordHash = await bcrypt.hash(password, 10);

// Verify
const isValid = await bcrypt.compare(password, user.passwordHash);
```

## Secrets Encryption
```typescript
// Encrypt (same pattern as SSH keys, different salt)
const key = crypto.scryptSync(process.env.AUTH_SECRET!, 'env-var-salt', 32);
const encrypted = /* AES-256-GCM encryption */;

// Store with flag
const entry: EnvVarEntry = { value: encrypted, encrypted: true };
```

## Audit Log
```typescript
await db.insert(userAuditLog).values({
  action: 'password_reset',
  performedBy: adminId,
  targetUserId: userId,
  targetUsername: user.username,
  ipAddress: request.headers.get('x-forwarded-for'),
});
```
