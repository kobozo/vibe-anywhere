# Contributing to Vibe Anywhere

Thank you for your interest in contributing to Vibe Anywhere! We welcome contributions from the community and are grateful for your support.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branching Strategy](#branching-strategy)
- [Branch Protection](#branch-protection)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

This project adheres to a code of conduct that all contributors are expected to follow. Please be respectful, inclusive, and considerate in all interactions.

## Getting Started

### Prerequisites

Before you begin, ensure you have:
- Node.js 22+
- PostgreSQL 16+
- Git 2.30+
- Docker (optional, for Docker backend testing)

### Development Setup

1. **Fork the repository** on GitHub

2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR-USERNAME/vibe-anywhere.git
   cd vibe-anywhere
   ```

3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/kobozo/vibe-anywhere.git
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

6. **Start PostgreSQL**:
   ```bash
   npm run docker:up
   ```

7. **Initialize database**:
   ```bash
   npm run db:push
   npx tsx scripts/seed-user.ts admin testpassword
   ```

8. **Start development server**:
   ```bash
   npm run dev
   ```

Visit `http://localhost:3000` to verify everything works.

## Development Workflow

### 1. Create a Feature Branch

Always work on a feature branch, never on `main`:

```bash
git checkout main
git pull upstream main
git checkout -b feature/your-feature-name
```

Branch naming conventions:
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring
- `test/description` - Test additions/modifications

### 2. Make Your Changes

- Write clean, readable code
- Follow existing patterns in the codebase
- Keep changes focused and atomic
- Test your changes thoroughly

### 3. Keep Your Branch Updated

Regularly sync with upstream:

```bash
git fetch upstream
git rebase upstream/main
```

### 4. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

### 5. Submit a Pull Request

Open a PR from your fork's branch to `kobozo/vibe-anywhere:main`

## Branching Strategy

Vibe Anywhere follows **GitHub Flow** - a simple, branch-based workflow that's perfect for open source collaboration.

### Key Points

- `main` branch is always production-ready
- All development happens in feature branches
- Pull requests are required for code review
- Direct commits to `main` are not allowed

### Branch Naming

Use descriptive branch names with the appropriate prefix:

- `feature/session-templates` - New features
- `fix/terminal-reconnect` - Bug fixes
- `docs/api-guide` - Documentation updates
- `refactor/db-layer` - Code refactoring
- `test/container-service` - Test additions

### Detailed Guide

For the complete branching strategy including hotfix workflows, branch lifecycle, and best practices, see:

**📖 [Branching Strategy Documentation](docs/BRANCHING.md)**

### Release Process

Releases are managed by maintainers. If you're interested in how releases work:

**📖 [Release Process Documentation](docs/RELEASE.md)**

## Branch Protection

The `main` branch is protected to ensure code quality and stability.

### Protection Rules

- **Pull requests required**: You cannot commit directly to `main`
- **Approval required**: At least 1 maintainer must approve your PR
- **Stale reviews dismissed**: New commits invalidate previous approvals
- **No force pushes**: Force push is disabled for everyone
- **No deletions**: The main branch cannot be deleted

### What This Means for Contributors

1. **Always use feature branches**: Create a branch from `main` for your work
2. **PRs are mandatory**: All changes must go through pull request review
3. **Be responsive to feedback**: Address review comments promptly
4. **Keep PRs updated**: Rebase on main if requested

### Testing Branch Protection

If you try to push directly to `main`, you'll see an error:

```bash
git push origin main
# ERROR: Cannot push to protected branch 'main'
```

This is expected! Create a feature branch and open a PR instead.

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Avoid `any` types - use proper typing
- Use interfaces for object shapes
- Export types that might be reused

### Code Style

- Run `npm run lint` before committing
- Use 2 spaces for indentation
- Use single quotes for strings
- Add semicolons at the end of statements
- Keep lines under 100 characters when reasonable

### File Organization

```typescript
// 1. Imports (grouped: React, third-party, local)
import { useState } from 'react';
import { socketService } from '@/lib/services';

// 2. Types/Interfaces
interface Props {
  sessionId: string;
}

// 3. Component/Function
export function Component({ sessionId }: Props) {
  // Implementation
}
```

### Component Guidelines

- Use functional components with hooks
- Keep components focused and single-purpose
- Extract reusable logic into custom hooks
- Use meaningful prop and variable names

### Database Changes

**IMPORTANT**: Never modify the database directly.

1. Edit `src/lib/db/schema.ts`
2. Generate migration: `npm run db:generate`
3. Review the generated SQL in `drizzle/*.sql`
4. Apply migration: `npm run db:migrate`
5. Commit both schema changes and migration files

## Commit Guidelines

### Commit Message Format

```
type(scope): brief description

Longer explanation if needed. Wrap at 72 characters.
Explain the problem this commit solves and why you chose
this solution.
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, semicolons, etc.)
- `refactor` - Code refactoring without functionality changes
- `perf` - Performance improvements
- `test` - Adding or updating tests
- `chore` - Maintenance tasks (deps, config, etc.)

### Examples

```
feat(sessions): add session filtering by status

Add dropdown to filter sessions by running/stopped state.
Implements #123.
```

```
fix(terminal): prevent memory leak on disconnect

Terminal instances weren't being properly cleaned up when
users disconnected. Added cleanup in disconnect handler.

Fixes #456.
```

### Best Practices

- Use present tense ("add feature" not "added feature")
- Keep first line under 72 characters
- Reference issues/PRs when relevant
- Explain *why*, not just *what*

## Pull Request Process

### Before Submitting

- [ ] Code follows style guidelines
- [ ] All tests pass: `npm run lint`
- [ ] Database migrations are included (if applicable)
- [ ] Documentation is updated (if applicable)
- [ ] Commits are clean and well-organized
- [ ] Branch is up-to-date with `main`

### PR Description Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would break existing functionality)
- [ ] Documentation update

## Related Issues
Closes #123
Related to #456

## Testing
Describe how you tested these changes:
- [ ] Tested locally with Docker backend
- [ ] Tested locally with Proxmox backend (if applicable)
- [ ] Manual testing of affected UI components
- [ ] Verified database migrations work correctly

## Screenshots (if applicable)
Add screenshots for UI changes.

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code in hard-to-understand areas
- [ ] I have updated documentation as needed
- [ ] My changes generate no new warnings
- [ ] I have tested on both Docker and Proxmox (if applicable)
```

### Review Process

1. Maintainers will review your PR
2. Address any feedback or requested changes
3. Keep the PR updated with `main`
4. Once approved, a maintainer will merge

### After Merge

1. Delete your feature branch:
   ```bash
   git branch -d feature/your-feature-name
   git push origin --delete feature/your-feature-name
   ```

2. Update your local `main`:
   ```bash
   git checkout main
   git pull upstream main
   ```

## Testing

### Running Tests

```bash
# Linting
npm run lint

# Type checking
npm run build
```

### Manual Testing Checklist

When making changes, test:

- [ ] Session creation and deletion
- [ ] Container start/stop operations
- [ ] Terminal attachment and interaction
- [ ] Git diff/status viewing
- [ ] Authentication flow
- [ ] WebSocket reconnection
- [ ] Multiple concurrent sessions

### Container Backend Testing

If your changes affect container management:

- Test with Docker backend if possible
- Document any Proxmox-specific behavior
- Note in PR if you couldn't test both backends

## Documentation

### When to Update Documentation

Update documentation when you:
- Add new features
- Change existing behavior
- Add configuration options
- Modify API endpoints
- Update dependencies

### Documentation Files

- `README.md` - User-facing documentation
- `CLAUDE.md` - Internal project knowledge base
- `docs/` - Detailed guides and specifications
- Code comments - Complex logic or non-obvious decisions

### Writing Guidelines

- Be clear and concise
- Use examples where helpful
- Keep formatting consistent
- Update table of contents if adding sections

## Community

### Getting Help

- **GitHub Issues**: Report bugs or request features
- **GitHub Discussions**: Ask questions, share ideas
- **Pull Requests**: Discuss implementation details

### Communication Guidelines

- Be respectful and constructive
- Search existing issues before creating new ones
- Provide detailed bug reports with reproduction steps
- Stay on topic in discussions

### Recognition

All contributors will be recognized in the project. Significant contributions may be highlighted in release notes.

---

## Questions?

If you have questions about contributing, feel free to:
- Open a discussion on GitHub
- Ask in an existing issue or PR
- Reach out to maintainers

Thank you for contributing to Vibe Anywhere! 🚀
