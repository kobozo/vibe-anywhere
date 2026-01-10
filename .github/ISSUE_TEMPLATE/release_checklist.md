---
name: Release Checklist
about: Track release preparation and execution
title: 'Release v[VERSION]'
labels: release
assignees: ''
---

## Release Information

- **Version**: vX.Y.Z
- **Type**: [ ] Stable  [ ] Pre-release (beta/rc)  [ ] Hotfix
- **Target Date**: YYYY-MM-DD
- **Release Manager**: @username

## Pre-Release Checklist

### Code Quality
- [ ] All intended features/fixes merged to `main`
- [ ] No known critical bugs
- [ ] Build successful: `npm run build`
- [ ] Linting passed: `npm run lint`
- [ ] No console errors/warnings in dev mode

### Testing
- [ ] Manual testing completed (Docker backend)
- [ ] Manual testing completed (Proxmox backend, if available)
- [ ] Session creation/deletion works
- [ ] Container start/stop works
- [ ] Terminal attachment and interaction works
- [ ] Git diff/status viewing works
- [ ] WebSocket reconnection works
- [ ] Multiple concurrent sessions work
- [ ] Database migrations tested

### Documentation
- [ ] README.md updated with new features
- [ ] CLAUDE.md updated (if internal changes)
- [ ] Breaking changes documented (if major release)
- [ ] Migration guide written (if needed)
- [ ] API changes documented (if applicable)

### Versioning
- [ ] Version number decided following semver
- [ ] Main app version will be: `X.Y.Z`
- [ ] Agent version updated (if agent changed): `X.Y.Z`
- [ ] CLI version updated (if CLI changed): `X.Y.Z`
- [ ] `agent-registry.ts` updated (if agent version changed)

### Release Notes
- [ ] Draft release notes prepared
- [ ] Highlighted major features/fixes
- [ ] Breaking changes called out (if any)
- [ ] Migration steps included (if needed)
- [ ] Contributors acknowledged

### Repository State
- [ ] Local `main` branch up to date
- [ ] No uncommitted changes
- [ ] No merge conflicts
- [ ] CI/CD passes (when available)

## Release Execution

### Preparation
- [ ] Ran `./scripts/prepare-release.sh`
- [ ] All checks passed

### GitHub Actions
- [ ] Navigated to [Actions → Release workflow](https://github.com/kobozo/vibe-anywhere/actions/workflows/release.yml)
- [ ] Clicked "Run workflow"
- [ ] Selected branch: `main` (or `hotfix/vX.Y.Z` for hotfixes)
- [ ] Entered version: `X.Y.Z`
- [ ] Workflow started successfully
- [ ] Workflow completed without errors (~5-10 minutes)

### Release Creation
- [ ] GitHub release created
- [ ] Release marked as pre-release (if applicable)
- [ ] Tag `vX.Y.Z` created
- [ ] Release assets attached (tarball)

### Release Notes Editing
- [ ] Opened release for editing
- [ ] Expanded auto-generated notes
- [ ] Added highlights and important changes
- [ ] Documented breaking changes (if any)
- [ ] Added screenshots (if UI changes)
- [ ] Thanked contributors
- [ ] Saved changes

## Post-Release Verification

### Artifacts
- [ ] Release tarball downloads successfully
- [ ] Tarball size is reasonable (~30-40 MB)
- [ ] Extracted and verified contents:
  - [ ] `.next/` directory exists
  - [ ] `public/` directory exists
  - [ ] `drizzle/` migrations exist
  - [ ] `scripts/` directory exists
  - [ ] `package.json` exists
  - [ ] `agent-bundle.tar.gz` exists
  - [ ] `VERSION` file contains correct version

### Installation Testing
- [ ] Install script downloads correct version
- [ ] Fresh installation completes successfully
- [ ] Service starts correctly
- [ ] Web UI is accessible
- [ ] Login works
- [ ] Can create and start a session

### Upgrade Testing (if applicable)
- [ ] Upgraded from previous version successfully
- [ ] Database migrations applied correctly
- [ ] Existing sessions still work
- [ ] No data loss

### Git State
- [ ] Tag exists and points to correct commit
- [ ] Main branch is stable

## Communication

### Announcements
- [ ] Posted on GitHub Discussions
- [ ] Social media announcement (if applicable)
- [ ] Discord/Slack notification (if applicable)
- [ ] Closed related issues with "Fixed in vX.Y.Z"
- [ ] Created milestone for next version

### Hotfix Follow-up (if hotfix release)
- [ ] Merged hotfix branch back to main
- [ ] Deleted hotfix branch
- [ ] Notified users of critical fix

## Rollback Plan

If critical issues are discovered:

1. **Assess severity**: Can it be hotfixed quickly?
2. **Mark release**: Add warning to release notes
3. **Consider draft**: Temporarily hide release if severe
4. **Prepare hotfix**: Follow hotfix workflow
5. **Communicate**: Notify users and recommend action

## Post-Mortem (if issues occurred)

Document any issues that occurred during release:

- **Issue**:
- **Impact**:
- **Root cause**:
- **Resolution**:
- **Prevention**:

## Notes

<!-- Add any additional notes, observations, or context here -->

---

**📖 Full Release Documentation**: [docs/RELEASE.md](https://github.com/kobozo/vibe-anywhere/blob/main/docs/RELEASE.md)
