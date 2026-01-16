/**
 * Role-Based Access Control (RBAC) Utilities
 *
 * This module provides utilities for checking user permissions based on their role.
 *
 * Role Capabilities:
 * - admin: Full system access, can manage users, templates, secrets, and repositories
 * - user-admin: Can manage user accounts, cannot create repositories
 * - developer: Can create and manage their own repositories
 * - template-admin: Can manage Proxmox templates and view all repositories
 * - security-admin: Can manage secrets and environment variables
 */

import type { User, Repository } from './db/schema';

/**
 * User role type - defines the available roles in the system
 */
export type Role = 'admin' | 'user-admin' | 'developer' | 'template-admin' | 'security-admin';

/**
 * Checks if a user has a specific role
 *
 * @param user - The user to check
 * @param role - The role to check for
 * @returns true if the user has the exact role specified
 */
export function hasRole(user: User, role: Role): boolean {
  return user.role === role;
}

/**
 * Checks if a user is an admin
 *
 * Admins have full system access and can perform any operation.
 *
 * @param user - The user to check
 * @returns true if the user has the 'admin' role
 */
export function isAdmin(user: User): boolean {
  return user.role === 'admin';
}

/**
 * Checks if a user can manage user accounts
 *
 * User management includes:
 * - Creating new users
 * - Modifying user properties
 * - Deleting users
 * - Resetting passwords
 *
 * NOTE: User-admin role prepared for future user management UI.
 *       Currently, the role exists in the permission system but
 *       no UI features are implemented yet. Future PRD will define
 *       the specific user management capabilities.
 *
 * @param user - The user to check
 * @returns true if the user is an admin or user-admin
 */
export function canManageUsers(user: User): boolean {
  return user.role === 'admin' || user.role === 'user-admin';
}

/**
 * Checks if a user can manage Proxmox templates
 *
 * Template management includes:
 * - Creating new templates
 * - Modifying template configurations
 * - Deleting templates
 * - Configuring tech stacks
 *
 * @param user - The user to check
 * @returns true if the user is an admin or template-admin
 */
export function canManageTemplates(user: User): boolean {
  return user.role === 'admin' || user.role === 'template-admin';
}

/**
 * Checks if a user can manage secrets and environment variables
 *
 * Secret management includes:
 * - Creating new secrets
 * - Viewing secret values
 * - Modifying secrets
 * - Deleting secrets
 * - Managing secret-repository associations
 *
 * @param user - The user to check
 * @returns true if the user is an admin or security-admin
 */
export function canManageSecrets(user: User): boolean {
  return user.role === 'admin' || user.role === 'security-admin';
}

/**
 * Checks if a user can create new repositories
 *
 * All roles including user-admin can create repositories.
 * User-admins have the same repository creation capabilities as developers.
 *
 * NOTE: User-admin role is prepared for future user management features.
 *       They can create repositories like developers, but cannot manage
 *       templates or secrets unless explicitly assigned those roles.
 *
 * @param user - The user to check
 * @returns true if the user can create repositories
 */
export function canCreateRepositories(user: User): boolean {
  // All roles can create repositories (including user-admin)
  return true;
}

/**
 * Checks if a user can access a specific repository
 *
 * Access is granted if:
 * - The user owns the repository (userId matches)
 * - The user is an admin (full system access)
 * - The user is a template-admin (can view all repositories)
 *
 * @param user - The user to check
 * @param repository - The repository to check access for
 * @returns true if the user can access the repository
 */
export function canAccessRepository(user: User, repository: Repository): boolean {
  // Owner can always access their own repository
  if (repository.userId === user.id) {
    return true;
  }

  // Admin and template-admin can access all repositories
  return user.role === 'admin' || user.role === 'template-admin';
}
