---
name: security-ops
description: Auto-triggers when working on authentication, secrets management, encryption, user management, roles, permissions, password handling, or audit logging. Keywords auth, authentication, secrets, encryption, password, user, role, permission, audit, bcrypt, AES.
context: fork
agent: security-config
---

# Security Operations Skill

This skill automatically triggers the security-config agent when you work on security features.

## When This Triggers

- Authentication implementation
- Secrets encryption/decryption
- User management
- Role-based access control
- Password hashing and validation
- Audit logging
- Environment variable encryption

## Quick Start

The security-config agent has comprehensive knowledge of:
- bcrypt password hashing
- AES-256-GCM secrets encryption
- User roles and permissions
- Forced password changes
- Audit log implementation
- Key derivation with scrypt

## Reference Files

- `PATTERNS.md` - Security patterns
- `EXAMPLES.md` - Real examples
- `TROUBLESHOOTING.md` - Common issues
- `ENCRYPTION-GUIDE.md` - Encryption implementation guide
