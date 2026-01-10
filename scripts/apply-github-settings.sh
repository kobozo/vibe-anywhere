#!/bin/bash
#
# Vibe Anywhere - Apply GitHub Repository Settings
#
# This script configures GitHub repository settings using the GitHub CLI (gh).
# It sets up:
# - Branch protection for main
# - Repository merge settings
# - Tag protection for release tags
#
# Prerequisites:
# - GitHub CLI (gh) must be installed and authenticated
# - You must have admin access to the repository
#

set -e

REPO="kobozo/vibe-anywhere"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}    Apply GitHub Repository Settings${NC}"
echo -e "${BLUE}    Repository: $REPO${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}✗ Error: GitHub CLI (gh) is not installed${NC}"
    echo ""
    echo "Install instructions:"
    echo "  https://cli.github.com/manual/installation"
    exit 1
fi

# Check if gh is authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${RED}✗ Error: GitHub CLI is not authenticated${NC}"
    echo ""
    echo "Run: gh auth login"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}✗ Error: jq is not installed${NC}"
    echo ""
    echo "Install jq:"
    echo "  Debian/Ubuntu: sudo apt-get install jq"
    echo "  macOS: brew install jq"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites met${NC}"
echo ""

# Confirm before making changes
echo -e "${YELLOW}⚠️  This script will configure the following settings:${NC}"
echo "  • Branch protection for 'main' (require PR, 1 approval, no force push)"
echo "  • Repository merge settings (squash, merge, rebase enabled)"
echo "  • Tag protection for 'v*' pattern"
echo ""
read -p "Continue? (y/n): " -n 1 -r
echo ""
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}✗ Aborted${NC}"
    exit 1
fi

# 1. Repository merge settings
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}         1. Repository Merge Settings${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "📝 Configuring merge settings..."

if gh api -X PATCH repos/$REPO \
  -f allow_squash_merge=true \
  -f allow_merge_commit=true \
  -f allow_rebase_merge=true \
  -f delete_branch_on_merge=true \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY \
  > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Merge settings configured${NC}"
else
    echo -e "${RED}✗ Failed to configure merge settings${NC}"
    echo "You may not have admin permissions for this repository"
    exit 1
fi
echo ""

# 2. Branch protection for main
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}         2. Branch Protection (main)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "🛡️  Setting up branch protection for 'main'..."

# Check if branch protection already exists
if gh api repos/$REPO/branches/main/protection > /dev/null 2>&1; then
    echo -e "${YELLOW}ℹ️  Branch protection already exists, updating...${NC}"
fi

# Apply branch protection rules
if gh api -X PUT repos/$REPO/branches/main/protection \
  --input - <<'EOF'
{
  "required_status_checks": null,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1,
    "require_last_push_approval": false
  },
  "enforce_admins": true,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_linear_history": false,
  "required_conversation_resolution": false
}
EOF
then
    echo -e "${GREEN}✓ Branch protection configured for 'main'${NC}"
else
    echo -e "${RED}✗ Failed to configure branch protection${NC}"
    exit 1
fi
echo ""

# 3. Tag protection
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}         3. Tag Protection${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "🏷️  Setting up tag protection for 'v*' pattern..."

# Check if tag protection already exists
if gh api repos/$REPO/tags/protection 2>/dev/null | jq -e '.[] | select(.pattern == "v*")' > /dev/null 2>&1; then
    echo -e "${YELLOW}ℹ️  Tag protection for 'v*' already exists, skipping${NC}"
else
    if gh api -X POST repos/$REPO/tags/protection -f pattern='v*' > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Tag protection configured for 'v*'${NC}"
    else
        echo -e "${RED}✗ Failed to configure tag protection${NC}"
        echo -e "${YELLOW}Note: Tag protection may require organization-level permissions${NC}"
    fi
fi
echo ""

# 4. Verify settings
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}         4. Verification${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "🔍 Verifying settings..."
echo ""

echo -e "${BLUE}Merge Settings:${NC}"
gh api repos/$REPO | jq '{
  allow_squash_merge,
  allow_merge_commit,
  allow_rebase_merge,
  delete_branch_on_merge
}'
echo ""

echo -e "${BLUE}Branch Protection (main):${NC}"
if gh api repos/$REPO/branches/main/protection 2>/dev/null | jq '{
  required_pull_request_reviews: .required_pull_request_reviews | {
    required_approving_review_count,
    dismiss_stale_reviews
  },
  enforce_admins: .enforce_admins.enabled,
  allow_force_pushes: .allow_force_pushes.enabled,
  allow_deletions: .allow_deletions.enabled
}'; then
    :
else
    echo -e "${YELLOW}Could not retrieve branch protection details${NC}"
fi
echo ""

echo -e "${BLUE}Tag Protection:${NC}"
if gh api repos/$REPO/tags/protection 2>/dev/null | jq '.[] | {pattern}'; then
    :
else
    echo -e "${YELLOW}No tag protection rules found or insufficient permissions${NC}"
fi
echo ""

# Summary
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}         ✓ Settings applied successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Applied settings:${NC}"
echo "  ✓ Merge settings (squash, merge, rebase enabled)"
echo "  ✓ Branch protection for 'main'"
echo "    - PRs required with 1 approval"
echo "    - Stale reviews dismissed"
echo "    - Force pushes disabled"
echo "    - Deletions disabled"
echo "  ✓ Tag protection for 'v*' pattern"
echo ""
echo -e "${BLUE}📖 View settings in GitHub:${NC}"
echo "  • Branch protection: https://github.com/$REPO/settings/branches"
echo "  • Repository settings: https://github.com/$REPO/settings"
echo "  • Tag protection: https://github.com/$REPO/settings/tag_protection"
echo ""
echo -e "${BLUE}💡 Test branch protection:${NC}"
echo "  Try pushing directly to main - it should be blocked:"
echo "  $ git push origin main"
echo "  # ERROR: Cannot push to protected branch 'main'"
echo ""
echo -e "${GREEN}Done! 🚀${NC}"
echo ""
