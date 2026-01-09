# Session Hub - TODO

## Project Rename

- [ ] **Rename project to vibe-anywhere** - Complete project rename from "session-hub" to "vibe-anywhere". This includes: directory names, package.json, Docker images/containers, documentation (README, CLAUDE.md, TODO.md), code references, environment variables, database references, UI text, git references, and any other mentions throughout the codebase.

## Environment Variables

- [x] **Sync detection on container operations** - When redeploying, destroying a container, or deleting a workspace, detect if there are differences between workspace `.env` and repository-level synced values. Show a modal asking to sync changes before proceeding.

- [ ] **Live update environment variables** - Push environment variable changes to running workspaces without losing sessions. Variables should be live-updated in the container.

## Git Hooks

- [x] **Repository-level hook sync** - Sync git hooks to repository level so new workspaces deploy hooks by default. Only needs to be configured once per repository.

- [ ] **Hook sync on close** - Same sync behavior for hooks when closing/destroying a workspace (prompt to sync if there are changes).

## Repository Management

- [x] **Git user configuration** - When adding a new repository, allow specifying git username and email. Add ability to create and manage git identities in settings, with option to set a default.

- [x] **Default project name** - When adding a new repository, default the project name to the repo name if user hasn't specified a custom one.

- [x] **Multi-step repository wizard** - Convert the "add repository" modal from one large form to a tabbed/wizard approach with Next/Next/Finish flow.

## Workspace Management

- [x] **Default workspace name** - When adding a workspace, auto-populate the name after creating or selecting a branch (don't leave it empty).

- [x] **Rename "Restart" to "Redeploy"** - Current restart behavior actually redeploys the workspace. Rename button/action accordingly.

- [x] **Add true restart functionality** - Implement actual container restart that preserves state but restarts services.

- [x] **Add shutdown functionality** - Add ability to shutdown/stop a workspace without destroying it.

- [x] **Close tabs on redeploy/destroy** - When redeploying or destroying a workspace, automatically close ALL tabs except dashboard.

- [x] **Advanced workspace creation options** - Extend the "add workspace" modal with a tabbed approach. Include advanced options tab for overwrites: static IP, force VMID, override image template.

- [x] **Proxmox container tags** - Add tags to templates and workspace containers in Proxmox for grouping. Include: repository name, tech stack items as individual tags. Branch name not needed.

## Tab System

- [x] **Dashboard tab not closeable** - Make the dashboard tab permanently visible (cannot be closed).

- [x] **Drag and drop tab ordering** - Allow reordering tabs via drag and drop.

- [x] **Terminal right-click context menu** - Add right-click context menu in terminal with split pane options. Include submenu for split direction (right, left, top, bottom) with choice to add an existing tab/group or start a new template tab.

- [ ] **AI-assisted terminal input** - Add shortcut/button/context menu option that opens an input modal. User types what they want to do, AI proposes a CLI command. Options: Accept (inputs command and presses enter), Correct (sends feedback in same chat session for refinement), Decline (closes modal).

- [x] **Terminal color customization** - Current theme overwrites terminal colors set by apps. Extend the theme with dedicated terminal color settings, or allow terminals to use their own color schemes independently.

- [x] **Fix tab template icons** - Git and Claude icons in the "add new tab" template dropdown don't display correctly. They show correct icons once opened as actual tabs.

## Sidebar

- [x] **Alphabetical ordering by default** - Sort repositories alphabetically in the sidebar by default.

- [x] **Filters and custom sort orders** - Add filtering options and custom sort orders for repositories in the sidebar.

- [x] **User menu in sidebar footer** - Move the logged-in user display to the sidebar footer. Clicking on the user opens a submenu with logout and other user options.

- [x] **Rename "Templates" to "Images"** - Rename the "Templates" section in the sidebar to "Images" for clarity.

- [x] **Sidebar right-click context menu** - Add right-click context menu for repositories and workspaces in the sidebar with relevant actions.

- [ ] **Collapsible repository groups/folders** - Group repositories by project, client, or custom tags. Allow creating folders to organize repositories.

- [ ] **Favorites/pinned repositories** - Star repos to pin them at the top of the sidebar for quick access.

- [ ] **Workspace status badges** - Show count of running/stopped containers per repository (e.g., "2/3 running").

- [ ] **Repository icons/colors** - Custom icons or color dots per repository for quick visual identification.

- [ ] **Bulk operations** - Select multiple workspaces to start/stop/redeploy at once.

- [ ] **Workspace branch indicators** - Show git branch with ahead/behind status on workspace items.

- [ ] **Last activity timestamp** - Show "2h ago" or similar on workspaces to indicate last activity.

- [ ] **Resizable sidebar** - Drag to resize sidebar width, persist preference.

- [ ] **Collapsible sidebar** - Minimize sidebar to icon-only rail view.

- [ ] **Persist filter/sort preferences** - Remember user's filter and sort settings across sessions.

## Themes

- [ ] **Light blue theme border contrast** - Borders in the light blue theme are too light and hard to see. Increase border color contrast for better visibility.

## Settings

- [ ] **Tab templates card layout** - In the settings modal, change tab templates from list view to card layout with 3 cards per row for better visual presentation.

## Onboarding

- [ ] **New user setup wizard** - When a new user signs in and has no repositories/workspaces, show a guided wizard to set up their first environment (add repository, configure SSH key, create first workspace, etc.).

## Debugging & Logs

- [ ] **Template creation logs** - Store logs (temporarily) when creating new templates. Currently errors like "Tech stack installation failed with exit code 100" are a black box with no way to diagnose what went wrong.

## New Features

- [ ] **Makefile tab** - If a Makefile is detected by the agent, allow adding a "Make" tab that can execute tasks from the Makefile. Show available make targets and allow one-click execution.

- [ ] **TODO tab** - A tab that scans the workspace codebase for TODO/FIXME/HACK/XXX comments and lists them. Clicking a TODO opens an AI tab for that workspace (first one if multiple exist), waits for the app to initialize, then types out the TODO text without pressing enter (allowing user to review before sending).

---
*Created: 2025-01-07*
