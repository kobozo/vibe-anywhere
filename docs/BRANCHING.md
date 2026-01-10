# Branching Strategy

Vibe Anywhere follows a simplified **GitHub Flow** branching model, optimized for open source collaboration and continuous delivery.

## Overview

**GitHub Flow** is a lightweight, branch-based workflow that supports teams and projects where deployments are made regularly. This strategy is perfect for open source projects because it's simple, proven, and easy for contributors to understand.

### Core Principles

- `main` is always deployable
- All development happens in feature branches
- Pull requests are required for code review
- Merges to main trigger potential releases
- Tags mark specific release points

## Branch Types

### Primary Branch: `main`

**Purpose**: Production-ready code

**Rules**:
- Protected branch (requires PR + approval)
- Always stable and deployable
- All releases are cut from main
- Direct commits are not allowed
- Force pushes are disabled

**Tags**: Release versions (e.g., `v1.0.0`, `v1.1.0-beta.1`)

### Supporting Branches

All development work happens in short-lived feature branches that branch from and merge back to `main`.

#### Feature Branches (`feature/*`)

**Purpose**: New features or enhancements

**Naming**: `feature/description-in-kebab-case`

**Examples**:
- `feature/session-templates`
- `feature/workspace-sharing`
- `feature/multi-user-support`

**Lifecycle**:
1. Branch from `main`
2. Develop feature
3. Open PR to `main`
4. Code review and approval
5. Merge to `main`
6. Delete branch

#### Bug Fix Branches (`fix/*`)

**Purpose**: Bug fixes for existing features

**Naming**: `fix/description-in-kebab-case`

**Examples**:
- `fix/terminal-reconnect`
- `fix/git-diff-display`
- `fix/container-memory-leak`

**Lifecycle**: Same as feature branches

#### Hotfix Branches (`hotfix/*`)

**Purpose**: Emergency fixes for production releases

**Naming**: `hotfix/vX.Y.Z` (include target version)

**Examples**:
- `hotfix/v1.0.1`
- `hotfix/v2.1.3`

**Lifecycle**:
1. Branch from release tag (e.g., `v1.0.0`)
2. Apply minimal fix
3. Test thoroughly
4. Bump version to patch (e.g., `1.0.1`)
5. Trigger release workflow
6. Merge back to `main`
7. Delete branch

See [Hotfix Workflow](#hotfix-workflow) for detailed steps.

#### Documentation Branches (`docs/*`)

**Purpose**: Documentation updates without code changes

**Naming**: `docs/description-in-kebab-case`

**Examples**:
- `docs/api-guide`
- `docs/proxmox-setup`
- `docs/contributing-updates`

**Lifecycle**: Same as feature branches

#### Refactoring Branches (`refactor/*`)

**Purpose**: Code refactoring without functionality changes

**Naming**: `refactor/description-in-kebab-case`

**Examples**:
- `refactor/db-layer`
- `refactor/session-service`
- `refactor/container-abstraction`

**Lifecycle**: Same as feature branches

#### Test Branches (`test/*`)

**Purpose**: Adding or updating tests

**Naming**: `test/description-in-kebab-case`

**Examples**:
- `test/container-service`
- `test/git-operations`
- `test/e2e-session-flow`

**Lifecycle**: Same as feature branches

## Workflow

### Starting New Work

1. **Ensure your local main is up to date**:
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Create your feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**:
   - Write code
   - Test locally
   - Commit with clear messages (see [Commit Guidelines](../CONTRIBUTING.md#commit-guidelines))

4. **Keep your branch up to date**:
   ```bash
   # Fetch latest changes
   git fetch origin

   # Rebase your branch on main
   git rebase origin/main
   ```

5. **Push your branch**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Creating a Pull Request

1. **Push your branch** to your fork (if external contributor) or origin (if maintainer)

2. **Open a Pull Request** on GitHub:
   - Title: Brief description of changes
   - Description: Use the PR template, include context and testing details
   - Link related issues: Use "Closes #123" or "Related to #456"

3. **Address review feedback**:
   - Make requested changes
   - Push new commits to the same branch
   - Respond to comments

4. **After approval**:
   - Maintainer will merge (usually squash merge for cleaner history)
   - Branch will be automatically deleted

### Keeping Branches Updated

Long-running feature branches should be regularly updated with main:

```bash
# While on your feature branch
git fetch origin
git rebase origin/main

# If there are conflicts, resolve them and continue
git rebase --continue

# Force push (only on your feature branch!)
git push origin feature/your-feature-name --force
```

**Important**: Only force push to your feature branches, never to `main`.

## Hotfix Workflow

Critical bugs in production require immediate attention. Here's the detailed hotfix process:

### Scenario: Critical Bug in v1.0.0

**Step 1: Create hotfix branch from release tag**

```bash
# Fetch all tags
git fetch --tags

# Create hotfix branch from the release tag
git checkout -b hotfix/v1.0.1 v1.0.0
```

**Step 2: Apply the fix**

- Make minimal changes to fix only the critical issue
- Avoid refactoring or adding features
- Test thoroughly on the hotfix branch
- Commit with clear message explaining the fix

```bash
# Make your fix
# ... edit files ...

# Commit
git add .
git commit -m "fix: resolve critical authentication bypass

Addresses security vulnerability where expired tokens
were still being accepted. This hotfix validates token
expiration before processing requests.

Fixes #789"
```

**Step 3: Update version**

```bash
# Update version in package.json to the patch version
npm version patch --no-git-tag-version

# Commit the version bump
git add package.json
git commit -m "chore: bump version to 1.0.1 for hotfix release"
```

**Step 4: Push hotfix branch**

```bash
git push origin hotfix/v1.0.1
```

**Step 5: Trigger release**

- Go to GitHub Actions → Release workflow
- Click "Run workflow"
- Select branch: `hotfix/v1.0.1`
- Enter version: `1.0.1`
- Run the workflow

**Step 6: Merge back to main**

After the release is published, merge the hotfix back to main:

```bash
git checkout main
git pull origin main
git merge hotfix/v1.0.1
git push origin main
```

**Step 7: Clean up**

```bash
# Delete local branch
git branch -d hotfix/v1.0.1

# Delete remote branch
git push origin --delete hotfix/v1.0.1
```

## Branch Protection

The `main` branch is protected with the following rules:

### Required Rules

- **Require pull request before merging**: All changes must go through PR
- **Require 1 approval**: At least one maintainer must approve
- **Dismiss stale reviews**: New commits invalidate previous approvals
- **No force pushes**: Force push is disabled for everyone
- **No deletions**: Branch cannot be deleted
- **Include administrators**: Rules apply to all users, including admins

### Future Rules (when CI/CD is added)

- **Require status checks**: All tests must pass before merge
- **Require up-to-date branches**: Branch must be current with main

## Best Practices

### Do's

- **Create small, focused branches**: Easier to review and less likely to conflict
- **Keep branches short-lived**: Merge within days, not weeks
- **Commit frequently**: Small, logical commits with clear messages
- **Rebase on main regularly**: Reduce merge conflicts
- **Test before pushing**: Ensure your changes work locally
- **Write descriptive PR descriptions**: Help reviewers understand context
- **Respond to feedback promptly**: Keep PRs moving forward
- **Delete merged branches**: Keep repository clean

### Don'ts

- **Don't commit directly to main**: Always use feature branches and PRs
- **Don't force push to main**: You can't anyway (it's protected!)
- **Don't let branches go stale**: Rebase regularly, merge quickly
- **Don't mix unrelated changes**: Keep each branch focused on one thing
- **Don't commit broken code**: Always test before pushing
- **Don't commit secrets**: Use environment variables
- **Don't skip code review**: Even trivial changes benefit from a second look
- **Don't rewrite public history**: Only force push to your own feature branches

## Common Scenarios

### Starting a New Feature

```bash
git checkout main
git pull origin main
git checkout -b feature/awesome-feature
# ... make changes ...
git add .
git commit -m "feat: add awesome feature"
git push origin feature/awesome-feature
# Open PR on GitHub
```

### Updating Your Branch with Main

```bash
git checkout feature/your-feature
git fetch origin
git rebase origin/main
# If conflicts, resolve them
git push origin feature/your-feature --force
```

### Abandoning a Branch

```bash
git checkout main
git branch -D feature/abandoned-feature
git push origin --delete feature/abandoned-feature
```

### Fixing a Bug in Production

See [Hotfix Workflow](#hotfix-workflow) above.

## Visualization

```
main ─────●─────────●─────────●──────v1.0.0────●─────v1.1.0────●
          │         │         │                 │               │
          │         │         │                 │               │
feature/A └─●─●─●──┘          │                 │               │
                              │                 │               │
feature/B ────────────────────└─●─●─●──────────┘               │
                                                                 │
hotfix/v1.0.1 ────────────────────●─●────────────────────────┐ │
                              (from v1.0.0)                   └─┘
```

## FAQ

**Q: Can I have multiple feature branches at once?**
A: Yes, but keep them independent and focused.

**Q: Should I rebase or merge when updating my branch?**
A: Rebase is preferred for cleaner history. Use `git rebase origin/main`.

**Q: What if my feature depends on another unmerged feature?**
A: Wait for the dependency to merge, or branch from the feature branch (coordinate with its author).

**Q: Can I commit directly to main if I'm a maintainer?**
A: No. Branch protection applies to everyone, including administrators.

**Q: How long should branches live?**
A: Days to a week ideally. If longer, break the feature into smaller PRs.

**Q: What if I need to release from a branch other than main?**
A: The only exception is hotfix branches. All other releases come from main.

## Resources

- [GitHub Flow Guide](https://guides.github.com/introduction/flow/)
- [Release Process](RELEASE.md)
- [Contributing Guidelines](../CONTRIBUTING.md)
- [Commit Message Guidelines](../CONTRIBUTING.md#commit-guidelines)

## Questions?

If you have questions about the branching strategy:
- Open a [GitHub Discussion](https://github.com/kobozo/vibe-anywhere/discussions)
- Ask in a PR review
- Check existing issues and PRs for examples
