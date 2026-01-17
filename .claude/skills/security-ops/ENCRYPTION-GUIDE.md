# Encryption Guide

## Algorithm
AES-256-GCM (authenticated encryption)

## Salts
- SSH Keys: `'ssh-key-salt'`
- Env Vars: `'env-var-salt'`

## Format
`<base64( IV[16] + AuthTag[16] + EncryptedData )>`

## Key Derivation
```typescript
crypto.scryptSync(process.env.AUTH_SECRET!, salt, 32);
```

## Storage
```typescript
{ value: encrypted_string, encrypted: true }
```
