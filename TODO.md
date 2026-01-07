# Session Hub - TODO

## Environment Variables

- [ ] **Sync detection on container operations** - When restarting, destroying a container, or deleting a workspace, detect if there are differences between workspace `.env` and repository-level synced values. Show a modal asking to sync changes before proceeding.

- [ ] **Live update environment variables** - Push environment variable changes to running workspaces without losing sessions. Variables should be live-updated in the container.

## Git Hooks

- [x] **Repository-level hook sync** - Sync git hooks to repository level so new workspaces deploy hooks by default. Only needs to be configured once per repository.

- [ ] **Hook sync on close** - Same sync behavior for hooks when closing/destroying a workspace (prompt to sync if there are changes).

## Repository Management

- [ ] **Git user configuration** - When adding a new repository, allow specifying git username and email. Add ability to create and manage git identities in settings, with option to set a default.

- [ ] **Default project name** - When adding a new repository, default the project name to the repo name if user hasn't specified a custom one.

- [ ] **Multi-step repository wizard** - Convert the "add repository" modal from one large form to a tabbed/wizard approach with Next/Next/Finish flow.

## Workspace Management

- [ ] **Default workspace name** - When adding a workspace, auto-populate the name after creating or selecting a branch (don't leave it empty).

- [ ] **Rename "Restart" to "Redeploy"** - Current restart behavior actually redeploys the workspace. Rename button/action accordingly.

- [ ] **Add true restart functionality** - Implement actual container restart that preserves state but restarts services.

- [ ] **Add shutdown functionality** - Add ability to shutdown/stop a workspace without destroying it.

- [ ] **Close tabs on redeploy** - When redeploying a workspace, automatically close ALL tabs except dashboard.

## Tab System

- [x] **Dashboard tab not closeable** - Make the dashboard tab permanently visible (cannot be closed).

- [ ] **Drag and drop tab ordering** - Allow reordering tabs via drag and drop.

## New Features

- [ ] **Makefile tab** - If a Makefile is detected by the agent, allow adding a "Make" tab that can execute tasks from the Makefile. Show available make targets and allow one-click execution.

- [ ] **TODO tab** - A tab that scans the workspace codebase for TODO/FIXME/HACK/XXX comments and lists them. Clicking a TODO opens an AI tab for that workspace (first one if multiple exist), waits for the app to initialize, then types out the TODO text without pressing enter (allowing user to review before sending).

---
*Created: 2025-01-07*
