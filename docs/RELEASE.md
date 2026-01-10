# Release Process

This document describes the release process for Vibe Anywhere maintainers. It covers stable releases, pre-releases, and hotfixes.

## Table of Contents

- [Overview](#overview)
- [Version Numbering](#version-numbering)
- [Release Types](#release-types)
- [Pre-Release Checklist](#pre-release-checklist)
- [Release Execution](#release-execution)
- [Post-Release Verification](#post-release-verification)
- [Hotfix Process](#hotfix-process)
- [Rollback Procedure](#rollback-procedure)
- [Tools and Scripts](#tools-and-scripts)

## Overview

Vibe Anywhere uses **manual versioning** with semantic versioning (semver) principles. Releases are triggered manually via GitHub Actions, giving maintainers full control over timing and version numbers.

### Release Philosophy

- `main` branch is always in a releasable state
- Releases can happen at any time from `main`
- Version numbers follow semantic versioning
- Pre-releases allow community testing before stable
- Hotfixes address critical production issues

### Key Principles

1. **Transparency**: All releases are tagged and documented
2. **Safety**: Pre-release testing before stable releases
3. **Speed**: Hotfix process for critical issues
4. **Quality**: Comprehensive checklist ensures nothing is missed

## Version Numbering

Vibe Anywhere follows [Semantic Versioning 2.0.0](https://semver.org/).

### Format

```
MAJOR.MINOR.PATCH[-PRERELEASE.NUMBER]
```

### Examples

- `1.0.0` - Stable release
- `1.1.0-beta.1` - Beta pre-release
- `2.0.0-rc.2` - Release candidate
- `1.0.1` - Patch release (hotfix)

### Version Components

**MAJOR** (x.0.0): Breaking changes
- API changes that break compatibility
- Database schema changes requiring manual migration
- Configuration format changes
- Major architectural rewrites
- Examples: `1.0.0` → `2.0.0`

**MINOR** (0.x.0): New features, backward compatible
- New features added
- New API endpoints
- New configuration options
- Performance improvements
- Examples: `1.0.0` → `1.1.0`

**PATCH** (0.0.x): Bug fixes, backward compatible
- Bug fixes
- Security patches
- Documentation corrections
- Minor improvements
- Examples: `1.0.0` → `1.0.1`

**PRERELEASE** (-suffix.number): Testing versions
- `alpha.N` - Early development, unstable
- `beta.N` - Feature complete, testing phase
- `rc.N` - Release candidate, final testing
- Examples: `1.0.0-beta.1`, `2.0.0-rc.2`

### Version Synchronization

**Main Application** (`package.json`):
- Follows standard semantic versioning
- Incremented with each release

**Agent** (`packages/agent/package.json`):
- Independent versioning based on agent changes
- Only bumped when agent code changes
- Current: `3.0.0`

**CLI** (`packages/vibe-anywhere-cli/package.json`):
- Kept in sync with agent version
- Current: `3.0.0`

**When to Bump Agent Version**:
- MAJOR: Breaking protocol changes, incompatible with old servers
- MINOR: New features, new commands, backward compatible
- PATCH: Bug fixes, performance improvements

## Release Types

### 1. Stable Release

**Purpose**: Production-ready release for general use

**Version format**: `X.Y.Z` (e.g., `1.0.0`, `1.2.0`, `2.0.0`)

**When to release**:
- After sufficient pre-release testing
- When all planned features for the version are complete
- After all high-priority bugs are fixed
- When documentation is up to date

**Process**:
1. Complete [Pre-Release Checklist](#pre-release-checklist)
2. Trigger release workflow with stable version number
3. Verify release on GitHub
4. Test installation from release tarball
5. Complete [Post-Release Verification](#post-release-verification)
6. Announce release

### 2. Pre-Release (Beta/RC)

**Purpose**: Community testing before stable release

**Version formats**:
- Beta: `X.Y.Z-beta.N` (e.g., `1.0.0-beta.1`)
- Release Candidate: `X.Y.Z-rc.N` (e.g., `1.0.0-rc.1`)

**When to release**:
- After merging significant new features
- Before a major/minor stable release
- When you need community testing and feedback

**Process**:
1. Complete basic testing (not as thorough as stable)
2. Trigger release workflow with pre-release version
3. Verify marked as "pre-release" on GitHub
4. Share with community for testing
5. Gather feedback and fix issues
6. Iterate (beta.2, beta.3, rc.1, etc.)
7. When stable, release without pre-release suffix

**Beta vs RC**:
- **Beta**: Feature-complete but may have bugs, API may change
- **RC**: Stable, only critical bugs will be fixed, no API changes

### 3. Hotfix Release

**Purpose**: Emergency patch for critical production issues

**Version format**: `X.Y.Z` where Z is patch increment (e.g., `1.0.1`)

**When to release**:
- Security vulnerabilities
- Data loss bugs
- Critical functionality broken
- Service unavailable issues

**Process**: See [Hotfix Process](#hotfix-process) section

## Pre-Release Checklist

Complete this checklist before triggering any release.

### Code Quality

- [ ] All intended features/fixes merged to `main`
- [ ] No known critical bugs
- [ ] Code builds successfully: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No console errors or warnings in dev mode

### Testing

- [ ] Manual testing completed on Docker backend
- [ ] Manual testing completed on Proxmox backend (if available)
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
- [ ] Main app version will be updated
- [ ] Agent version updated if agent changed
- [ ] CLI version updated if CLI changed
- [ ] `agent-registry.ts` updated if agent version changed

### Release Notes

- [ ] Draft release notes prepared
- [ ] Highlight major features/fixes
- [ ] Breaking changes called out (if any)
- [ ] Migration steps included (if needed)
- [ ] Contributors acknowledged

### Repository State

- [ ] Local `main` branch is up to date
- [ ] No uncommitted changes
- [ ] No merge conflicts
- [ ] CI/CD passes (when available)

## Release Execution

### Step-by-Step Process

**1. Prepare the release**

```bash
# Ensure you're on main and up to date
git checkout main
git pull origin main

# Verify clean state
git status

# Optional: Use prepare script
./scripts/prepare-release.sh
```

**2. Trigger GitHub Actions workflow**

- Go to GitHub: [Actions → Release](https://github.com/kobozo/vibe-anywhere/actions/workflows/release.yml)
- Click **"Run workflow"** button
- Keep branch as `main` (or select hotfix branch if applicable)
- Enter version number:
  - Stable: `1.0.0`
  - Beta: `1.0.0-beta.1`
  - RC: `1.0.0-rc.1`
  - Hotfix: `1.0.1`
- Click **"Run workflow"**

**3. Monitor workflow execution**

- Watch the workflow run (takes ~5-10 minutes)
- Check for any errors
- If it fails, fix the issue and retry

**4. Verify release created**

- Go to [Releases page](https://github.com/kobozo/vibe-anywhere/releases)
- Verify new release is listed
- Check if marked as "pre-release" (for beta/rc)
- Verify assets are attached:
  - `vibe-anywhere-vX.Y.Z.tar.gz`
- Review auto-generated release notes

**5. Edit release notes**

- Click **"Edit"** on the release
- Expand auto-generated notes
- Add highlights and important changes
- Document breaking changes (if any)
- Add screenshots (if UI changes)
- Thank contributors
- Save changes

## Post-Release Verification

After publishing a release, verify everything works correctly.

### Verification Checklist

**Release Artifacts**

- [ ] Release tarball downloads successfully
- [ ] Tarball size is reasonable (~30-40 MB)
- [ ] Extract tarball and verify contents:
  - [ ] `.next/` directory exists
  - [ ] `public/` directory exists
  - [ ] `drizzle/` migrations exist
  - [ ] `scripts/` directory exists
  - [ ] `package.json` exists
  - [ ] `agent-bundle.tar.gz` exists
  - [ ] `VERSION` file contains correct version

**Installation Testing**

- [ ] Install script downloads correct version:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/kobozo/vibe-anywhere/main/scripts/install.sh | sudo bash
  ```
- [ ] Fresh installation completes successfully
- [ ] Service starts correctly
- [ ] Web UI is accessible
- [ ] Login works
- [ ] Can create and start a session

**Upgrade Testing** (if applicable)

- [ ] Upgrade from previous version works
- [ ] Database migrations apply correctly
- [ ] Existing sessions still work
- [ ] No data loss

**Git State**

- [ ] Tag exists: `git tag | grep vX.Y.Z`
- [ ] Tag points to correct commit
- [ ] Main branch is stable

**Community Communication**

- [ ] Announce on GitHub Discussions
- [ ] Post on social media (if applicable)
- [ ] Update Discord/Slack (if applicable)
- [ ] Close related issues with "Fixed in vX.Y.Z"

### If Issues Found

If critical issues are found during verification:

1. **Document the issue**: Create a GitHub issue
2. **Assess severity**:
   - **Critical**: Follow [Rollback Procedure](#rollback-procedure)
   - **High**: Plan hotfix release
   - **Medium/Low**: Fix in next release

## Hotfix Process

Critical bugs in production require immediate hotfix releases.

### When to Hotfix

**Do hotfix for**:
- Security vulnerabilities
- Data loss or corruption
- Service crashes or unavailability
- Authentication/authorization bypasses

**Don't hotfix for**:
- Minor bugs with workarounds
- UI glitches
- Performance issues (unless severe)
- Non-critical features

### Hotfix Workflow

**1. Create hotfix branch from release tag**

```bash
# Fetch tags
git fetch --tags

# Create hotfix branch from the problematic release
git checkout -b hotfix/v1.0.1 v1.0.0
```

**2. Apply the fix**

- Make **minimal** changes to fix only the critical issue
- No refactoring, no feature additions
- Test thoroughly
- Commit with clear message

```bash
# Make fix
# ... edit files ...

# Commit
git add .
git commit -m "fix: resolve critical issue with [component]

Detailed description of the fix and why it's critical.

Fixes #123"
```

**3. Update version**

```bash
# Bump to patch version
npm version patch --no-git-tag-version

# Commit version bump
git add package.json
git commit -m "chore: bump version to 1.0.1 for hotfix"
```

**4. Push hotfix branch**

```bash
git push origin hotfix/v1.0.1
```

**5. Trigger release from hotfix branch**

- Go to GitHub Actions → Release workflow
- Select branch: `hotfix/v1.0.1`
- Enter version: `1.0.1`
- Run workflow

**6. Merge hotfix back to main**

```bash
git checkout main
git pull origin main
git merge hotfix/v1.0.1
git push origin main
```

**7. Clean up**

```bash
git branch -d hotfix/v1.0.1
git push origin --delete hotfix/v1.0.1
```

**8. Communicate**

- Mark release notes with "HOTFIX" badge
- Notify users to upgrade immediately
- Document the issue and fix

## Rollback Procedure

If a release has critical issues that can't be hotfixed quickly, rollback may be necessary.

### Assess the Situation

**Before rolling back, consider**:
1. Can it be hotfixed quickly? (Preferred)
2. Is the issue impacting all users or just some?
3. Is the previous version still available?
4. Will rollback cause data loss?

### Rollback Steps

**1. Mark release as broken**

- Edit the GitHub release
- Add **⚠️ CRITICAL ISSUE** warning to description
- Mark as draft (temporarily hides it)
- Explain the issue and recommend previous version

**2. Update install script (if needed)**

If the install script points to "latest":
- Consider adding version pinning temporarily
- Or update install script to skip the broken version

**3. Prepare hotfix**

- Follow [Hotfix Process](#hotfix-process)
- Test extremely thoroughly
- Release as patch version

**4. Re-enable release**

Once hotfix is released:
- Un-draft the broken release
- Update notes to point to hotfix
- Explain what happened and how it was fixed

**5. Post-mortem**

- Document what went wrong
- Update checklists to prevent recurrence
- Consider additional testing for this type of issue

## Tools and Scripts

### `scripts/prepare-release.sh`

Helper script to prepare for a release.

**Usage**:
```bash
./scripts/prepare-release.sh
```

**What it does**:
- Checks git status is clean
- Ensures on `main` branch
- Pulls latest changes
- Runs linting and build
- Prompts for version number
- Displays next steps

### `scripts/version-bump.sh`

Utility to bump versions consistently.

**Usage**:
```bash
# Bump to specific version
./scripts/version-bump.sh 1.2.0

# Bump with type (major, minor, patch)
./scripts/version-bump.sh patch
./scripts/version-bump.sh minor
```

**What it does**:
- Updates `package.json` version
- Optionally updates agent/CLI versions
- Updates `agent-registry.ts` if needed
- Creates version bump commit

### GitHub Actions Workflow

**Location**: `.github/workflows/release.yml`

**Trigger**: Manual workflow dispatch

**Inputs**:
- `version`: Version number (e.g., `1.0.0`, `1.0.0-beta.1`)

**Process**:
1. Checkout code
2. Install dependencies
3. Build application
4. Build agent binary
5. Assemble release tarball
6. Create GitHub release
7. Upload artifacts

### Issue Template

**Location**: `.github/ISSUE_TEMPLATE/release_checklist.md`

Use this template to track release preparation.

## FAQ

**Q: How often should we release?**
A: Release when ready. Could be weekly for minor updates, monthly for features, or immediately for hotfixes.

**Q: Should we always do pre-releases?**
A: For major/minor versions, yes. For patches, usually not needed.

**Q: Can we skip version numbers?**
A: Yes, but maintain semantic versioning. It's fine to go from 1.0.0 to 1.2.0 directly.

**Q: What if the workflow fails?**
A: Fix the issue, update the workflow if needed, and retry. Failed workflows don't create releases.

**Q: Can we edit releases after publishing?**
A: Yes, release notes can be edited. Artifacts shouldn't be changed (create new release instead).

**Q: How do we handle database migrations in releases?**
A: Migrations in `drizzle/` directory are included in release tarball. Run `npm run db:migrate` after deploying.

**Q: What about agent version mismatches?**
A: The server checks agent version and prompts for updates. Include agent updates in release notes.

**Q: Can we delete releases?**
A: Technically yes, but strongly discouraged. Mark as draft or add warning instead.

## Resources

- [Semantic Versioning](https://semver.org/)
- [Branching Strategy](BRANCHING.md)
- [Contributing Guidelines](../CONTRIBUTING.md)
- [GitHub Releases Guide](https://docs.github.com/en/repositories/releasing-projects-on-github)

## Need Help?

If you have questions about the release process:
- Ask in [GitHub Discussions](https://github.com/kobozo/vibe-anywhere/discussions)
- Review previous releases for examples
- Consult with other maintainers
