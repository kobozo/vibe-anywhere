#!/bin/bash
#
# Vibe Anywhere - Release Preparation Script
#
# This script helps prepare for a release by:
# - Checking git status is clean
# - Ensuring on main branch
# - Pulling latest changes
# - Running linting and build
# - Prompting for version number
# - Displaying next steps

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}        Vibe Anywhere - Release Preparation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 1. Check if git is available
if ! command -v git &> /dev/null; then
    echo -e "${RED}✗ Error: git is not installed${NC}"
    exit 1
fi

# 2. Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}✗ Error: Not in a git repository${NC}"
    exit 1
fi

# 3. Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${BLUE}📍 Current branch:${NC} $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${YELLOW}⚠️  Warning: You're not on the 'main' branch${NC}"
    echo -e "${YELLOW}   Releases should be created from 'main'${NC}"
    echo ""
    read -p "Do you want to switch to main? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git checkout main
        CURRENT_BRANCH="main"
    else
        echo -e "${RED}✗ Aborted${NC}"
        exit 1
    fi
fi

# 4. Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${RED}✗ Error: You have uncommitted changes${NC}"
    echo ""
    git status --short
    echo ""
    echo -e "${YELLOW}Please commit or stash your changes before preparing a release${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Git status is clean${NC}"

# 5. Pull latest changes
echo ""
echo -e "${BLUE}📥 Pulling latest changes from origin/main...${NC}"
git pull origin main
echo -e "${GREEN}✓ Up to date with origin/main${NC}"

# 6. Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo ""
echo -e "${BLUE}📦 Current version:${NC} v$CURRENT_VERSION"

# 7. Run linting
echo ""
echo -e "${BLUE}🔍 Running linting...${NC}"
if npm run lint; then
    echo -e "${GREEN}✓ Linting passed${NC}"
else
    echo -e "${RED}✗ Linting failed${NC}"
    echo -e "${YELLOW}Please fix linting errors before releasing${NC}"
    exit 1
fi

# 8. Run build
echo ""
echo -e "${BLUE}🏗️  Building application...${NC}"
if npm run build; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    echo -e "${YELLOW}Please fix build errors before releasing${NC}"
    exit 1
fi

# 9. Ask for version number
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                Version Selection${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "What type of release is this?"
echo ""
echo "  1) Patch release   (bug fixes, backward compatible)"
echo "  2) Minor release   (new features, backward compatible)"
echo "  3) Major release   (breaking changes)"
echo "  4) Pre-release     (beta, rc, alpha)"
echo "  5) Custom version  (specify manually)"
echo ""
read -p "Select option (1-5): " -n 1 -r RELEASE_TYPE
echo ""
echo ""

case $RELEASE_TYPE in
    1)
        # Parse version and increment patch
        IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
        # Remove any pre-release suffix
        patch="${patch%%-*}"
        NEW_VERSION="$major.$minor.$((patch + 1))"
        ;;
    2)
        # Parse version and increment minor
        IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
        NEW_VERSION="$major.$((minor + 1)).0"
        ;;
    3)
        # Parse version and increment major
        IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
        NEW_VERSION="$((major + 1)).0.0"
        ;;
    4)
        echo "Pre-release type:"
        echo "  1) Alpha    (early development, unstable)"
        echo "  2) Beta     (feature complete, testing)"
        echo "  3) RC       (release candidate, final testing)"
        echo ""
        read -p "Select option (1-3): " -n 1 -r PRE_TYPE
        echo ""
        echo ""

        read -p "Enter pre-release number (e.g., 1, 2, 3): " PRE_NUM
        echo ""

        case $PRE_TYPE in
            1) PRE_SUFFIX="alpha" ;;
            2) PRE_SUFFIX="beta" ;;
            3) PRE_SUFFIX="rc" ;;
            *)
                echo -e "${RED}✗ Invalid option${NC}"
                exit 1
                ;;
        esac

        # If current version has patch > 0, keep it, else increment minor
        IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
        patch="${patch%%-*}"
        if [ "$patch" == "0" ]; then
            NEW_VERSION="$major.$((minor + 1)).0-$PRE_SUFFIX.$PRE_NUM"
        else
            NEW_VERSION="$major.$minor.$patch-$PRE_SUFFIX.$PRE_NUM"
        fi
        ;;
    5)
        read -p "Enter custom version (e.g., 1.2.0 or 1.2.0-beta.1): " NEW_VERSION
        echo ""
        ;;
    *)
        echo -e "${RED}✗ Invalid option${NC}"
        exit 1
        ;;
esac

echo -e "${BLUE}📦 New version will be:${NC} v$NEW_VERSION"
echo ""
read -p "Is this correct? (y/n): " -n 1 -r
echo ""
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}✗ Aborted${NC}"
    exit 1
fi

# 10. Check if agent version needs updating
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                Agent Version Check${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

AGENT_VERSION=$(node -p "require('./packages/agent/package.json').version")
echo -e "${BLUE}Current agent version:${NC} v$AGENT_VERSION"
echo ""
echo "Did you make changes to the agent code (packages/agent/)?"
read -p "(y/n): " -n 1 -r AGENT_CHANGED
echo ""
echo ""

if [[ $AGENT_CHANGED =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠️  Remember to:${NC}"
    echo "  1. Update packages/agent/package.json version"
    echo "  2. Update packages/vibe-anywhere-cli/package.json version (same as agent)"
    echo "  3. Update src/lib/services/agent-registry.ts EXPECTED_AGENT_VERSION"
    echo "  4. Rebuild agent: cd packages/agent && npm run bundle"
    echo ""
    echo "Refer to CLAUDE.md for agent versioning guidelines."
    echo ""
fi

# 11. Display next steps
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}         ✓ Pre-release checks passed${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Next steps to create release v$NEW_VERSION:${NC}"
echo ""
echo "  1. Go to GitHub Actions:"
echo -e "     ${BLUE}https://github.com/kobozo/vibe-anywhere/actions/workflows/release.yml${NC}"
echo ""
echo "  2. Click '${GREEN}Run workflow${NC}' button"
echo ""
echo "  3. Keep branch as: ${GREEN}main${NC}"
echo ""
echo "  4. Enter version: ${GREEN}$NEW_VERSION${NC}"
echo ""
echo "  5. Click '${GREEN}Run workflow${NC}' to start"
echo ""
echo "  6. Monitor the workflow execution (~5-10 minutes)"
echo ""
echo "  7. After completion:"
echo "     - Verify release created on GitHub"
echo "     - Edit release notes and add highlights"
echo "     - Test installation from tarball"
echo "     - Announce the release"
echo ""
echo -e "${BLUE}📖 Full release checklist:${NC} docs/RELEASE.md"
echo ""
echo -e "${GREEN}Good luck with the release! 🚀${NC}"
echo ""
