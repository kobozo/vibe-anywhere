# Product Requirements Document: Admin User Management UI

## 1. Introduction

Vibe Anywhere currently has user role infrastructure in place (admin, user-admin, developer, template-admin, security-admin) but lacks a user interface for administrators to manage users. The auth service (`src/lib/services/auth-service.ts`) has foundational user management methods, but creating, editing, or deleting users currently requires direct database access or scripts.

This feature will provide a comprehensive user management interface accessible to both `admin` and `user-admin` roles, enabling user lifecycle management (create, edit, role changes, password resets, deactivation) with full audit logging for compliance and security purposes.

**Problem Statement:** Administrators have no way to manage users through the UI, requiring technical database knowledge or scripts for basic user administration tasks.

**Solution:** Add a "Users" tab to the Settings page with a complete user management interface, including audit logging for all administrative actions.

---

## 2. Goals

- Enable administrators to manage user accounts without database access
- Support full user lifecycle: create, edit roles, reset passwords, deactivate/delete
- Provide audit trail for all user management actions (compliance/security)
- Allow both `admin` and `user-admin` roles to perform user management
- Integrate seamlessly with existing Settings page design patterns
- Prevent accidental deletion of users with active resources (workspaces/repositories)

---

## 3. User Stories

### US-001: Create Users Tab in Settings Page
**Description:** As an admin, I want to access user management through a dedicated tab in Settings so that I can manage users alongside other system configurations.

**Acceptance Criteria:**
- [ ] Add "Users" tab to Settings page navigation (after Templates tab)
- [ ] Tab only visible to users with `canManageUsers()` permission (admin + user-admin)
- [ ] Tab shows user management interface when selected
- [ ] URL updates to `/settings?tab=users` when selected
- [ ] Typecheck/lint passes
- [ ] **Verify in browser:** Settings page shows Users tab for admin users

---

### US-002: Display User List Table
**Description:** As an admin, I want to see a table of all users with their roles and status so that I can quickly understand the current user base.

**Acceptance Criteria:**
- [ ] Display table with columns: Username, Role, Created Date, Status, Actions
- [ ] Role displayed as colored badge matching existing badge component patterns
- [ ] Show user count in tab header (e.g., "Users (5)")
- [ ] Status column shows "Active" or "Inactive" (if soft delete implemented)
- [ ] Sort by created date (newest first) by default
- [ ] Actions column includes: Edit, Reset Password, Delete/Deactivate buttons
- [ ] Empty state message if no users exist
- [ ] Typecheck/lint passes
- [ ] **Verify in browser:** User list displays correctly with proper role badges

---

### US-003: Create New User Dialog
**Description:** As an admin, I want to create new user accounts with username, password, and role assignment so that I can onboard new users to the system.

**Acceptance Criteria:**
- [ ] "Create User" button above user table (follows existing button patterns)
- [ ] Modal dialog with form fields: Username, Password, Confirm Password, Role dropdown
- [ ] Username validation: 3-32 characters, alphanumeric + hyphens/underscores
- [ ] Password validation: 8+ characters, uppercase, lowercase, number (matches existing requirement)
- [ ] Password confirmation must match
- [ ] Role dropdown includes all roles: admin, user-admin, developer, template-admin, security-admin
- [ ] Default role: developer
- [ ] Show error messages for validation failures (inline, red text)
- [ ] Show success toast notification after creation
- [ ] Table refreshes automatically after successful creation
- [ ] API endpoint: `POST /api/users` with auth check for `canManageUsers()`
- [ ] Typecheck/lint passes
- [ ] **Verify in browser:** Can create new user and see them appear in table

---

### US-004: Edit User Details Dialog
**Description:** As an admin, I want to edit user details (username) so that I can correct mistakes or update user information.

**Acceptance Criteria:**
- [ ] "Edit" button in Actions column opens edit dialog
- [ ] Dialog pre-populates with current username
- [ ] Allow editing username only (role changes in separate story)
- [ ] Same username validation as create (3-32 chars, alphanumeric + hyphens/underscores)
- [ ] Check for duplicate username before saving
- [ ] Show success toast after successful edit
- [ ] Table updates automatically after edit
- [ ] Cannot edit own username (show disabled message)
- [ ] API endpoint: `PATCH /api/users/[id]` with auth check for `canManageUsers()`
- [ ] Audit log entry created (see US-008)
- [ ] Typecheck/lint passes
- [ ] **Verify in browser:** Can edit username and see change reflected immediately

---

### US-005: Change User Role
**Description:** As an admin, I want to change a user's role so that I can adjust their permissions as their responsibilities change.

**Acceptance Criteria:**
- [ ] Role dropdown in user table row allows inline role changes (or separate "Change Role" button)
- [ ] Dropdown includes all roles: admin, user-admin, developer, template-admin, security-admin
- [ ] Show confirmation dialog before changing role: "Change [username]'s role to [new role]?"
- [ ] Confirmation dialog explains permission differences (brief tooltip/description)
- [ ] Prevent changing own role (show error: "Cannot change your own role")
- [ ] Show success toast after role change
- [ ] Table updates immediately after change (role badge updates)
- [ ] API endpoint: `PATCH /api/users/[id]/role` with auth check for `canManageUsers()`
- [ ] Audit log entry created (see US-008)
- [ ] Typecheck/lint passes
- [ ] **Verify in browser:** Can change role and badge updates correctly

---

### US-006: Reset User Password
**Description:** As an admin, I want to reset a user's password so that I can help users who have forgotten their credentials or need immediate access.

**Acceptance Criteria:**
- [ ] "Reset Password" button in Actions column opens reset dialog
- [ ] Two options: "Force password change on next login" OR "Set temporary password"
- [ ] Option 1: Sets `forcePasswordChange = true`, user keeps current password until login
- [ ] Option 2: Admin enters new temporary password (same validation: 8+ chars, etc.)
- [ ] Option 2: Sets `forcePasswordChange = true` so user must change on next login
- [ ] Confirmation dialog: "Reset password for [username]?"
- [ ] Show success message with instruction (e.g., "User will be required to change password on next login")
- [ ] Cannot reset own password through this interface (show error)
- [ ] API endpoint: `POST /api/users/[id]/reset-password` with auth check for `canManageUsers()`
- [ ] Audit log entry created (see US-008)
- [ ] Typecheck/lint passes
- [ ] **Verify in browser:** Password reset works, user sees force password change modal on next login

---

### US-007: Delete/Deactivate User with Safeguards
**Description:** As an admin, I want to deactivate or delete users while preventing accidental deletion of users with active resources so that I can safely manage the user lifecycle.

**Acceptance Criteria:**
- [ ] "Delete" button in Actions column opens delete/deactivate dialog
- [ ] Check if user owns any repositories or workspaces
- [ ] If user has active resources: Show warning "Cannot delete [username] - owns X repositories and Y workspaces. Reassign or delete resources first."
- [ ] If no resources: Show confirmation dialog with two options:
  - [ ] "Deactivate" (soft delete): Sets `status = 'inactive'` flag (requires schema change)
  - [ ] "Permanently Delete" (hard delete): Removes user from database (dangerous, red warning)
- [ ] Soft delete recommended by default (primary button)
- [ ] Hard delete requires typing username to confirm
- [ ] Cannot delete/deactivate own account (show error)
- [ ] Show success toast after deletion/deactivation
- [ ] Table updates immediately (user removed or shows "Inactive" status)
- [ ] API endpoint: `DELETE /api/users/[id]` with auth check for `canManageUsers()`
- [ ] Audit log entry created (see US-008)
- [ ] Typecheck/lint passes
- [ ] **Verify in browser:** Cannot delete user with resources, can deactivate user without resources

---

### US-008: Audit Log Database Schema and Service
**Description:** As a system administrator, I want all user management actions logged to a database table so that I can track who made what changes and when for security and compliance.

**Acceptance Criteria:**
- [ ] Create `user_audit_log` table in `src/lib/db/schema.ts`:
  - [ ] `id` (UUID primary key)
  - [ ] `action` (enum: 'user_created', 'user_edited', 'role_changed', 'password_reset', 'user_deleted', 'user_deactivated')
  - [ ] `performedBy` (userId, foreign key to users.id)
  - [ ] `targetUserId` (UUID, foreign key to users.id, nullable for deleted users)
  - [ ] `targetUsername` (text, denormalized for deleted users)
  - [ ] `details` (jsonb, stores action-specific data: old role, new role, etc.)
  - [ ] `ipAddress` (text, optional)
  - [ ] `userAgent` (text, optional)
  - [ ] `timestamp` (integer, Unix ms)
- [ ] Generate migration: `npm run db:generate`
- [ ] Apply migration: `npm run db:migrate`
- [ ] Create `AuditLogService` in `src/lib/services/audit-log-service.ts`:
  - [ ] `logUserAction(action, performedBy, targetUser, details)` method
  - [ ] Singleton pattern matching other services
- [ ] Update all user management API routes to call audit logging after successful operations
- [ ] Typecheck/lint passes
- [ ] **Verify:** Can insert audit log entries and query them from database

---

### US-009: Audit Log Display UI
**Description:** As an admin, I want to view the audit log of user management actions so that I can review changes and investigate issues.

**Acceptance Criteria:**
- [ ] "Audit Log" button/tab within Users section (or separate expandable section)
- [ ] Display table with columns: Timestamp, Action, Performed By, Target User, Details
- [ ] Action column shows human-readable labels: "Created User", "Changed Role", "Reset Password", etc.
- [ ] Details column shows relevant info: "Role changed from developer to admin"
- [ ] Sort by timestamp (newest first)
- [ ] Show last 100 entries by default (pagination optional)
- [ ] Highlight destructive actions (delete) in red
- [ ] Filter dropdown: All Actions, User Created, Role Changed, Password Reset, User Deleted
- [ ] API endpoint: `GET /api/audit-log?type=user_management` with auth check for `canManageUsers()`
- [ ] Typecheck/lint passes
- [ ] **Verify in browser:** Audit log displays correctly with proper formatting

---

### US-010: Permission Enforcement for User-Admin Role
**Description:** As a user-admin, I want to access the user management UI with the same permissions as admin so that I can perform my delegated administrative duties.

**Acceptance Criteria:**
- [ ] Verify `canManageUsers()` helper (in `src/lib/permissions.ts`) correctly includes both admin and user-admin roles
- [ ] All user management API routes use `canManageUsers()` check (not just `isAdmin()`)
- [ ] User-admin role can see Users tab in Settings
- [ ] User-admin role can perform all operations: create, edit, role change, password reset, delete
- [ ] User-admin cannot elevate their own role to admin (enforce in role change endpoint)
- [ ] User-admin can grant admin role to other users (as intended)
- [ ] Update permission checks in all 7 API endpoints (create, edit, role change, reset password, delete, list, audit log)
- [ ] Typecheck/lint passes
- [ ] **Verify in browser:** Login as user-admin, can access and use all user management features

---

## 4. Functional Requirements

### FR-1: User Lifecycle Management
The system must allow authorized users (admin, user-admin) to create, edit, and delete/deactivate user accounts through a web interface.

### FR-2: Role Assignment
The system must allow authorized users to assign any of the five roles (admin, user-admin, developer, template-admin, security-admin) to user accounts, with restrictions on self-role changes.

### FR-3: Password Management
The system must allow authorized users to reset user passwords by either forcing a password change on next login or setting a temporary password that must be changed on next login.

### FR-4: Resource Protection
The system must prevent deletion of users who own active repositories or workspaces, requiring resource reassignment or deletion first.

### FR-5: Soft Delete Option
The system must provide a "deactivate" option (soft delete) that marks users as inactive without removing data, preserving audit history and resource ownership records.

### FR-6: Audit Logging
The system must log all user management actions to a persistent database table, including: action type, performer, target user, timestamp, and action-specific details (e.g., role changes).

### FR-7: Permission Enforcement
The system must enforce `canManageUsers()` permission checks on all user management API endpoints, allowing both admin and user-admin roles while preventing privilege escalation.

### FR-8: Self-Protection
The system must prevent users from deleting themselves, changing their own role, or resetting their own password through the admin interface.

### FR-9: Settings Integration
The user management interface must be accessed via a "Users" tab within the existing Settings page, following established UI patterns for tabs, tables, dialogs, and buttons.

### FR-10: Audit Log Viewing
The system must provide a read-only audit log view showing user management history with filtering capabilities (by action type) and clear formatting for review.

---

## 5. Non-Goals (Out of Scope)

### NG-1: Email Notifications
This feature will NOT include email notifications for password resets, account creation, or role changes. Users will need to be informed through other channels.

### NG-2: Bulk User Operations
This feature will NOT include bulk user creation (CSV import) or bulk role changes. Each user must be managed individually.

### NG-3: User Profile Fields
This feature will NOT add additional user profile fields (email, full name, avatar, etc.). Only username and role management are included.

### NG-4: Self-Service Password Reset
This feature will NOT include a "forgot password" flow for end users. Password resets are admin-initiated only.

### NG-5: Advanced Audit Log Features
This feature will NOT include audit log export, advanced search, date range filtering, or long-term archival. Basic viewing and filtering only.

### NG-6: User Groups/Teams
This feature will NOT include user groups, teams, or organizational units. All permissions are individual role-based.

### NG-7: Two-Factor Authentication
This feature will NOT include 2FA or MFA setup. Authentication remains simple password-based.

### NG-8: User Session Management
This feature will NOT include viewing active user sessions or force-logout capabilities. Session management is out of scope.

---

## 6. Design Considerations

### UI Patterns to Follow

**Settings Page Structure:**
- Follow existing Settings tab pattern (Proxmox, SSH Keys, Templates)
- Tab header: "Users (X)" showing user count
- Same layout: tab content area with white background card

**User Table Design:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Users (5)                                      [+ Create User]  │
├─────────────────────────────────────────────────────────────────┤
│ Username      Role            Created        Status    Actions  │
├─────────────────────────────────────────────────────────────────┤
│ admin         [Admin Badge]   2026-01-10    Active    [•••]    │
│ jdoe          [Developer]     2026-01-11    Active    [•••]    │
│ ...                                                              │
└─────────────────────────────────────────────────────────────────┘
```

**Role Badges:**
- Reuse existing badge component patterns from workspace sharing UI
- Color coding:
  - `admin` - Red badge (`bg-red-500/20 text-red-400`)
  - `user-admin` - Orange badge (`bg-orange-500/20 text-orange-400`)
  - `developer` - Blue badge (`bg-blue-500/20 text-blue-400`)
  - `template-admin` - Purple badge (`bg-purple-500/20 text-purple-400`)
  - `security-admin` - Green badge (`bg-green-500/20 text-green-400`)

**Dialog Patterns:**
- Follow existing modal dialog pattern from `CreateWorkspaceDialog.tsx`
- Fixed overlay: `fixed inset-0 bg-black/50 flex items-center justify-center z-50`
- Dialog container: `bg-background-secondary rounded-lg max-w-lg`
- Header with title and close button
- Form content with error message display
- Footer with Cancel and Submit buttons

**Form Field Styling:**
- Text inputs: `bg-background-tertiary border border-border rounded px-3 py-2 text-sm`
- Labels: `text-sm font-medium text-foreground-secondary mb-1`
- Error messages: `text-error text-sm mt-1`
- Dropdowns: Same styling as inputs with chevron-down icon

**Button Patterns:**
- Primary: `bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded`
- Secondary: `bg-background-tertiary hover:bg-background-tertiary/80 px-4 py-2 rounded`
- Danger: `bg-error hover:bg-error/90 text-white px-4 py-2 rounded`
- Disabled: `opacity-50 cursor-not-allowed`

**Toast Notifications:**
- Reuse existing toast system (if available) or implement simple top-right toast
- Success: Green background with checkmark icon
- Error: Red background with X icon
- Auto-dismiss after 3 seconds

**Actions Dropdown:**
- Three-dot menu button (`[•••]`) opens dropdown
- Dropdown options:
  - Edit User
  - Change Role
  - Reset Password
  - ─────────── (separator)
  - Delete User (red text)

---

## 7. Technical Considerations

### Database Changes

**New Table: `user_audit_log`**
```typescript
// Add to src/lib/db/schema.ts

export const userAuditActionEnum = pgEnum('user_audit_action', [
  'user_created',
  'user_edited',
  'role_changed',
  'password_reset',
  'user_deleted',
  'user_deactivated',
]);

export const userAuditLog = pgTable('user_audit_log', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  action: userAuditActionEnum('action').notNull(),
  performedBy: uuid('performed_by')
    .references(() => users.id, { onDelete: 'set null' })
    .notNull(),
  targetUserId: uuid('target_user_id')
    .references(() => users.id, { onDelete: 'set null' }),
  targetUsername: text('target_username').notNull(),
  details: text('details').$type<Record<string, any>>().default('{}'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  timestamp: integer('timestamp').$defaultFn(() => Date.now()).notNull(),
});

export type UserAuditLog = typeof userAuditLog.$inferSelect;
```

**Users Table Changes (Optional - for soft delete):**
```typescript
// Add to users table in schema.ts if implementing soft delete
status: text('status', { enum: ['active', 'inactive'] }).default('active'),
deactivatedAt: integer('deactivated_at'),
deactivatedBy: uuid('deactivated_by').references(() => users.id),
```

**Migration Steps:**
1. Modify `src/lib/db/schema.ts`
2. Run `npm run db:generate` to create migration
3. Review generated SQL in `drizzle/` directory
4. Run `npm run db:migrate` to apply
5. Commit both schema changes and migration SQL files

### Service Layer

**New Service: `AuditLogService`**
```typescript
// src/lib/services/audit-log-service.ts

export class AuditLogService {
  async logUserAction(
    action: UserAuditAction,
    performedBy: string,
    targetUser: { id: string; username: string },
    details: Record<string, any> = {},
    request?: NextRequest
  ): Promise<UserAuditLog> {
    const ipAddress = request?.headers.get('x-forwarded-for') ||
                      request?.headers.get('x-real-ip') || null;
    const userAgent = request?.headers.get('user-agent') || null;

    const [log] = await db.insert(userAuditLog).values({
      action,
      performedBy,
      targetUserId: targetUser.id,
      targetUsername: targetUser.username,
      details: JSON.stringify(details),
      ipAddress,
      userAgent,
      timestamp: Date.now(),
    }).returning();

    return log;
  }

  async getUserAuditLogs(
    filters?: { action?: string; targetUserId?: string; limit?: number }
  ): Promise<Array<UserAuditLog & { performedByUser: User }>> {
    // Query with joins to get performer details
  }
}

// Singleton pattern
let auditLogServiceInstance: AuditLogService | null = null;

export function getAuditLogService(): AuditLogService {
  if (!auditLogServiceInstance) {
    auditLogServiceInstance = new AuditLogService();
  }
  return auditLogServiceInstance;
}
```

**Update AuthService:**
```typescript
// src/lib/services/auth-service.ts

// Add methods for admin user management
async createUser(
  username: string,
  password: string,
  role: UserRole = 'developer'
): Promise<User> {
  // Validate username is unique
  // Hash password with bcrypt (SALT_ROUNDS = 12)
  // Generate token
  // Insert and return user
}

async updateUsername(userId: string, newUsername: string): Promise<User> {
  // Check for duplicate username
  // Update and return user
}

async changeUserRole(userId: string, newRole: UserRole): Promise<User> {
  // Update role and return user
}

async resetUserPassword(
  userId: string,
  newPassword?: string
): Promise<User> {
  // If newPassword provided, hash and update
  // Set forcePasswordChange = true
  // Return user
}

async deleteUser(userId: string): Promise<void> {
  // Check for owned repositories/workspaces
  // If none, delete user (hard delete)
  // Throws error if resources exist
}

async deactivateUser(userId: string, deactivatedBy: string): Promise<User> {
  // Set status = 'inactive'
  // Set deactivatedAt, deactivatedBy
  // Return user
}

async listAllUsers(): Promise<User[]> {
  // Return all users sorted by createdAt desc
}
```

### API Endpoints

**New Endpoints:**
```
POST   /api/users                    - Create user
GET    /api/users                    - List all users
PATCH  /api/users/[id]              - Update username
PATCH  /api/users/[id]/role         - Change role
POST   /api/users/[id]/reset-password - Reset password
DELETE /api/users/[id]              - Delete/deactivate user
GET    /api/audit-log?type=user_management - Get audit logs
```

**Permission Middleware Pattern:**
```typescript
// All endpoints must include:
const user = await requireAuth(request);
if (!canManageUsers(user)) {
  throw new ApiRequestError('Forbidden', 'FORBIDDEN', 403);
}

// For role changes, add additional check:
if (body.userId === user.id && body.newRole !== user.role) {
  throw new ApiRequestError(
    'Cannot change your own role',
    'CANNOT_SELF_ELEVATE',
    403
  );
}
```

**Audit Logging Integration:**
```typescript
// After successful operation in each endpoint:
const auditLogService = getAuditLogService();
await auditLogService.logUserAction(
  'user_created', // or appropriate action
  user.id,
  { id: newUser.id, username: newUser.username },
  { role: newUser.role }, // action-specific details
  request
);
```

### Frontend Components

**Component Structure:**
```
src/components/
├── settings/
│   ├── users/
│   │   ├── UserManagementTab.tsx       # Main container
│   │   ├── UserTable.tsx               # User list table
│   │   ├── CreateUserDialog.tsx        # Create user modal
│   │   ├── EditUserDialog.tsx          # Edit username modal
│   │   ├── ChangeRoleDialog.tsx        # Role change confirmation
│   │   ├── ResetPasswordDialog.tsx     # Password reset options
│   │   ├── DeleteUserDialog.tsx        # Delete/deactivate confirmation
│   │   ├── AuditLogPanel.tsx           # Audit log display
│   │   └── UserActionDropdown.tsx      # Actions menu
```

**State Management:**
- Use `useState` for local form state
- Use `useAuth` hook to get current user for permission checks
- Fetch user list on mount with `useEffect`
- Refetch after mutations (create, edit, delete)

**API Client Pattern:**
```typescript
// Follow existing pattern from workspace/repository components
const response = await fetch('/api/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({ username, password, role }),
});

if (!response.ok) {
  const error = await response.json();
  throw new Error(error.error?.message || 'Failed to create user');
}

const { data } = await response.json();
```

### Existing Code to Reference

**Permission Helpers:**
- `src/lib/permissions.ts` - Already has `canManageUsers()` helper

**Similar UI Components:**
- `src/components/workspaces/create-workspace-dialog.tsx` - Dialog pattern
- `src/components/repositories/share-repository-dialog.tsx` - Form validation
- `src/components/settings/templates/template-list.tsx` - Table pattern
- `src/components/sidebar/user-menu.tsx` - Role badge display

**Similar API Routes:**
- `src/app/api/users/[id]/role/route.ts` - Already exists! Check permissions
- `src/app/api/workspaces/[id]/share/route.ts` - Permission check pattern
- `src/app/api/auth/change-password/route.ts` - Password validation

**Auth Patterns:**
- `src/lib/services/auth-service.ts` - Existing methods (login, validateToken, changePassword)
- `src/hooks/useAuth.ts` - Authentication context

### Dependencies

**No new dependencies required** - all functionality can be implemented with:
- Existing Drizzle ORM for database operations
- Existing bcrypt for password hashing
- Existing Zod for input validation
- Existing Tailwind CSS for styling
- Existing React hooks for state management

---

## 8. Success Metrics

### Primary Metrics

**Adoption:**
- 100% of user management actions performed through UI (vs. database/scripts)
- All admins successfully use the interface within 1 week of deployment

**Functionality:**
- All 4 operations (create, edit, reset password, delete) work correctly
- Zero privilege escalation bugs (users cannot change own roles)
- Zero accidental deletions of users with active resources

### Secondary Metrics

**Audit Compliance:**
- 100% of user management actions logged to audit table
- Audit log queryable and readable by admins
- No gaps in audit trail (all actions captured)

**User Experience:**
- Average time to create new user: < 30 seconds
- Average time to change role: < 10 seconds
- Zero confusion about soft delete vs. hard delete (clear UI messaging)

### Technical Metrics

**Code Quality:**
- All TypeScript type checks pass
- All ESLint rules pass
- No console errors in browser
- Follows existing codebase patterns (no architectural drift)

**Performance:**
- User list loads in < 500ms
- Create/edit/delete operations complete in < 1 second
- Audit log queries return in < 1 second

---

## 9. Open Questions

### Q1: Should we add an email field to users now?
**Context:** Current schema only has username. Email would be useful for future password reset flows, but is out of scope for this PRD.

**Options:**
- A) Add email field now as optional (future-proofing)
- B) Skip email field, add in future feature when needed
- C) Add email field and require it for new users

**Recommendation:** Option B - Keep scope focused. Add email field when implementing self-service password reset.

---

### Q2: Should user-admin be able to create other user-admins or admins?
**Context:** Current requirement allows user-admin to grant admin role to others, but doesn't restrict creating new admins.

**Options:**
- A) Allow user-admin to create/promote to any role (including admin)
- B) Restrict user-admin from creating/promoting to admin role
- C) Restrict user-admin from creating/promoting to admin OR user-admin

**Recommendation:** Option A for simplicity - admin can always demote if needed. If security concern, choose Option B.

---

### Q3: What happens to workspaces shared by a deleted user?
**Context:** If User A shares a workspace with User B, then User A is deleted, what happens to the share?

**Options:**
- A) Cascade delete shares (User B loses access)
- B) Keep shares but show "Shared by [deleted user]"
- C) Reassign shares to system admin

**Recommendation:** Option A - Cascade delete with `ON DELETE CASCADE` foreign key. Prevents orphaned shares.

---

### Q4: Should there be a "locked" status for users (e.g., too many failed logins)?
**Context:** Current auth system has no account locking mechanism. This could prevent brute-force attacks.

**Options:**
- A) Add account locking feature now (in scope)
- B) Skip for now, add as separate security feature later
- C) Add `locked` status column but don't implement locking logic yet

**Recommendation:** Option B - Out of scope for user management UI. Add as separate security feature if needed.

---

## 10. Appendix: User Story Sizing Estimate

| Story | Complexity | Estimated Story Points | Depends On |
|-------|------------|------------------------|------------|
| US-001 | Low | 2 | None |
| US-002 | Low | 3 | US-001 |
| US-003 | Medium | 5 | US-001, US-002 |
| US-004 | Low | 3 | US-002 |
| US-005 | Medium | 5 | US-002 |
| US-006 | Medium | 5 | US-002 |
| US-007 | High | 8 | US-002 |
| US-008 | High | 8 | None (can be parallel) |
| US-009 | Medium | 5 | US-008 |
| US-010 | Low | 2 | US-003 through US-007 |

**Total Estimated Effort:** 46 story points (~5-7 Claude Code sessions)

**Recommended Implementation Order:**
1. US-008 (Audit Log Schema) - Foundation
2. US-001 (Settings Tab) - UI foundation
3. US-002 (User List) - Core display
4. US-003 (Create User) - First operation
5. US-004, US-005, US-006, US-007 (Other operations) - Can be done in parallel
6. US-009 (Audit Log Display) - After operations work
7. US-010 (Permission Enforcement) - Final verification

---

**PRD Version:** 1.0
**Last Updated:** 2026-01-13
**Author:** Claude (Vibe Anywhere AI Assistant)
**Stakeholder:** Vibe Anywhere Admin Team
