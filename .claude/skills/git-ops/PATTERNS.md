# Git Operations Patterns

## SSH Key Encryption
```typescript
// Encrypt
const key = crypto.scryptSync(process.env.AUTH_SECRET!, 'ssh-key-salt', 32);
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(privateKey), cipher.final()]);
const authTag = cipher.getAuthTag();
return Buffer.concat([iv, authTag, encrypted]).toString('base64');

// Decrypt
const combined = Buffer.from(encryptedKey, 'base64');
const iv = combined.subarray(0, 16);
const authTag = combined.subarray(16, 32);
const encrypted = combined.subarray(32);
const key = crypto.scryptSync(process.env.AUTH_SECRET!, 'ssh-key-salt', 32);
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag);
return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
```

## Git ls-remote
```typescript
const { stdout } = await execAsync(`git ls-remote --heads "${repoUrl}"`, {
  env: { ...process.env, GIT_SSH_COMMAND: sshCommand },
});
const branches = stdout.split('\n')
  .filter(line => line.includes('refs/heads/'))
  .map(line => line.split('refs/heads/')[1]);
```
