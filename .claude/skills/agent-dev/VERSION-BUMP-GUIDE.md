# Version Bump Guide

## Files to Update (ALL THREE)
1. `packages/agent/package.json` - "version": "3.2.0"
2. `packages/vibe-anywhere-cli/package.json` - "version": "3.2.0" (match agent)
3. `src/lib/services/agent-registry.ts` - `const EXPECTED_AGENT_VERSION = '3.2.0'`

## Rebuild
```bash
cd packages/agent && npm run bundle
```

## Commit
```bash
git add packages/agent/package.json packages/vibe-anywhere-cli/package.json src/lib/services/agent-registry.ts packages/agent/agent-bundle.tar.gz
git commit -m "chore: bump agent version to 3.2.0"
```
