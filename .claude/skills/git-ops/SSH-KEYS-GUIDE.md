# SSH Keys Guide

## Encryption Format
`<base64( IV[16] + AuthTag[16] + EncryptedData )>`

## Salt
- **SSH Keys**: `'ssh-key-salt'`
- **Env Vars**: `'env-var-salt'`

## Key Derivation
```typescript
const key = crypto.scryptSync(process.env.AUTH_SECRET!, 'ssh-key-salt', 32);
```

## Storage
- Public key: Plain text
- Private key: AES-256-GCM encrypted
- Fingerprint: SHA256 hash of public key
