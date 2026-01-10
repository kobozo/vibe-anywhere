#!/bin/bash
#
# Vibe Anywhere - Version Bump Script
#
# This script bumps version numbers consistently across the codebase.
# Usage:
#   ./scripts/version-bump.sh <version|type>
#
# Examples:
#   ./scripts/version-bump.sh 1.2.0          # Set specific version
#   ./scripts/version-bump.sh patch          # Increment patch (0.0.x)
#   ./scripts/version-bump.sh minor          # Increment minor (0.x.0)
#   ./scripts/version-bump.sh major          # Increment major (x.0.0)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if argument provided
if [ -z "$1" ]; then
    echo -e "${RED}✗ Error: Version or type argument required${NC}"
    echo ""
    echo "Usage: $0 <version|type>"
    echo ""
    echo "Examples:"
    echo "  $0 1.2.0          # Set specific version"
    echo "  $0 patch          # Increment patch (0.0.x)"
    echo "  $0 minor          # Increment minor (0.x.0)"
    echo "  $0 major          # Increment major (x.0.0)"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}✗ Error: package.json not found${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
    echo ""
    git status --short
    echo ""
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}         Vibe Anywhere - Version Bump${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}Current version:${NC} v$CURRENT_VERSION"

# Determine new version
VERSION_ARG="$1"
if [[ "$VERSION_ARG" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-.*)?$ ]]; then
    # Explicit version provided
    NEW_VERSION="$VERSION_ARG"
elif [ "$VERSION_ARG" == "patch" ] || [ "$VERSION_ARG" == "minor" ] || [ "$VERSION_ARG" == "major" ]; then
    # Use npm version to calculate
    NEW_VERSION=$(npm version "$VERSION_ARG" --no-git-tag-version | sed 's/^v//')
    # Reset to original version (we'll set it properly below)
    npm version "$CURRENT_VERSION" --no-git-tag-version --allow-same-version > /dev/null 2>&1
else
    echo -e "${RED}✗ Error: Invalid version or type: $VERSION_ARG${NC}"
    echo ""
    echo "Expected:"
    echo "  - Semantic version: 1.2.0, 1.0.0-beta.1, etc."
    echo "  - Bump type: patch, minor, major"
    exit 1
fi

echo -e "${BLUE}New version:${NC}     v$NEW_VERSION"
echo ""

# Confirm version bump
read -p "Bump version to v$NEW_VERSION? (y/n): " -n 1 -r
echo ""
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}✗ Aborted${NC}"
    exit 1
fi

# Update main package.json
echo -e "${BLUE}📝 Updating package.json...${NC}"
npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version > /dev/null 2>&1
echo -e "${GREEN}✓ Updated package.json to v$NEW_VERSION${NC}"

# Ask if agent version should be updated
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}             Agent Version${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

AGENT_VERSION=$(node -p "require('./packages/agent/package.json').version")
echo -e "${BLUE}Current agent version:${NC} v$AGENT_VERSION"
echo ""
echo "Do you want to update the agent version?"
echo "(Only do this if agent code changed)"
echo ""
read -p "Update agent version? (y/n): " -n 1 -r UPDATE_AGENT
echo ""
echo ""

if [[ $UPDATE_AGENT =~ ^[Yy]$ ]]; then
    echo "What agent version?"
    echo "  1) Same as main ($NEW_VERSION)"
    echo "  2) Specify manually"
    echo ""
    read -p "Select option (1-2): " -n 1 -r AGENT_OPTION
    echo ""
    echo ""

    if [ "$AGENT_OPTION" == "1" ]; then
        AGENT_NEW_VERSION="$NEW_VERSION"
    elif [ "$AGENT_OPTION" == "2" ]; then
        read -p "Enter agent version (e.g., 3.1.0): " AGENT_NEW_VERSION
        echo ""
    else
        echo -e "${RED}✗ Invalid option${NC}"
        exit 1
    fi

    # Update agent package.json
    echo -e "${BLUE}📝 Updating packages/agent/package.json...${NC}"
    cd packages/agent
    npm version "$AGENT_NEW_VERSION" --no-git-tag-version --allow-same-version > /dev/null 2>&1
    cd ../..
    echo -e "${GREEN}✓ Updated agent package.json to v$AGENT_NEW_VERSION${NC}"

    # Update CLI package.json (keep in sync with agent)
    echo -e "${BLUE}📝 Updating packages/vibe-anywhere-cli/package.json...${NC}"
    cd packages/vibe-anywhere-cli
    npm version "$AGENT_NEW_VERSION" --no-git-tag-version --allow-same-version > /dev/null 2>&1
    cd ../..
    echo -e "${GREEN}✓ Updated CLI package.json to v$AGENT_NEW_VERSION${NC}"

    # Update agent-registry.ts
    echo -e "${BLUE}📝 Updating src/lib/services/agent-registry.ts...${NC}"
    AGENT_REGISTRY_FILE="src/lib/services/agent-registry.ts"

    if [ -f "$AGENT_REGISTRY_FILE" ]; then
        # Replace EXPECTED_AGENT_VERSION value
        sed -i "s/const EXPECTED_AGENT_VERSION = '[^']*'/const EXPECTED_AGENT_VERSION = '$AGENT_NEW_VERSION'/" "$AGENT_REGISTRY_FILE"

        # Also update process.env fallback if it exists
        sed -i "s/process\.env\.AGENT_VERSION \|\| '[^']*'/process.env.AGENT_VERSION || '$AGENT_NEW_VERSION'/" "$AGENT_REGISTRY_FILE"

        echo -e "${GREEN}✓ Updated EXPECTED_AGENT_VERSION to v$AGENT_NEW_VERSION${NC}"
    else
        echo -e "${YELLOW}⚠️  Warning: $AGENT_REGISTRY_FILE not found${NC}"
        echo "Please manually update EXPECTED_AGENT_VERSION"
    fi

    echo ""
    echo -e "${YELLOW}⚠️  Don't forget to rebuild the agent:${NC}"
    echo "   cd packages/agent && npm run bundle"
else
    echo -e "${BLUE}ℹ️  Agent version unchanged (v$AGENT_VERSION)${NC}"
fi

# Stage changes
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}              Git Commit${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Files changed:"
echo ""
git status --short
echo ""
echo "Do you want to commit these changes?"
read -p "(y/n): " -n 1 -r COMMIT_CHANGES
echo ""
echo ""

if [[ $COMMIT_CHANGES =~ ^[Yy]$ ]]; then
    # Stage all version changes
    git add package.json package-lock.json

    if [[ $UPDATE_AGENT =~ ^[Yy]$ ]]; then
        git add packages/agent/package.json packages/agent/package-lock.json
        git add packages/vibe-anywhere-cli/package.json packages/vibe-anywhere-cli/package-lock.json
        git add src/lib/services/agent-registry.ts
        COMMIT_MSG="chore: bump version to $NEW_VERSION, agent to $AGENT_NEW_VERSION"
    else
        COMMIT_MSG="chore: bump version to $NEW_VERSION"
    fi

    git commit -m "$COMMIT_MSG"

    echo -e "${GREEN}✓ Changes committed${NC}"
    echo ""
    echo -e "${BLUE}Commit message:${NC} $COMMIT_MSG"
else
    echo -e "${YELLOW}⚠️  Changes not committed${NC}"
    echo "You can commit manually with:"
    echo "  git add package.json"
    if [[ $UPDATE_AGENT =~ ^[Yy]$ ]]; then
        echo "  git add packages/agent/package.json"
        echo "  git add packages/vibe-anywhere-cli/package.json"
        echo "  git add src/lib/services/agent-registry.ts"
    fi
    echo "  git commit -m 'chore: bump version to $NEW_VERSION'"
fi

# Summary
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}         ✓ Version bump complete${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Summary:${NC}"
echo -e "  Main version:  ${GREEN}v$CURRENT_VERSION${NC} → ${GREEN}v$NEW_VERSION${NC}"
if [[ $UPDATE_AGENT =~ ^[Yy]$ ]]; then
    echo -e "  Agent version: ${GREEN}v$AGENT_VERSION${NC} → ${GREEN}v$AGENT_NEW_VERSION${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Rebuild agent: cd packages/agent && npm run bundle"
    echo "  2. Test the changes"
    echo "  3. Push to remote: git push origin main"
else
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Test the changes"
    echo "  2. Push to remote: git push origin main"
fi
echo ""
