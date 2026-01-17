# Template Patterns

## Tech Stack Definition
```typescript
{
  id: 'nodejs',
  name: 'Node.js 22',
  installScript: `
#!/bin/bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
  `,
  verifyCommand: 'node --version',
}
```

## Install as User (not root)
```typescript
installScript: `
su - kobozo -c "
  npm config set prefix ~/.npm-global
  npm install -g @anthropic-ai/claude-code
"
`
```

## Template Inheritance
```typescript
const effective = [...template.inheritedTechStacks, ...template.techStacks];
```
