import bcrypt from 'bcrypt';
import { eq, desc, and, or, ne } from 'drizzle-orm';
import { db, users, repositories, workspaces, type User, type NewUser, type UserRole } from '@/lib/db';
import { config } from '@/lib/config';
import { v4 as uuidv4 } from 'uuid';

const SALT_ROUNDS = 12;

export interface AuthResult {
  user: Pick<User, 'id' | 'username' | 'role' | 'createdAt' | 'updatedAt'>;
  token: string;
  forcePasswordChange: boolean;
}

export class AuthService {
  /**
   * Create a new user
   */
  async createUser(username: string, password: string, role: UserRole = 'developer'): Promise<AuthResult> {
    // Check if username already exists
    const existing = await this.getUserByUsername(username);
    if (existing) {
      throw new Error('Username already exists');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const token = this.generateToken();

    const [user] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        token,
        role,
      })
      .returning();

    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
      forcePasswordChange: Boolean(user.forcePasswordChange),
    };
  }

  /**
   * Authenticate user with username and password
   */
  async login(username: string, password: string): Promise<AuthResult> {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    // Generate new token on each login
    const token = this.generateToken();
    const updatedAt = Date.now();
    await db.update(users).set({ token, updatedAt }).where(eq(users.id, user.id));

    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt,
      },
      token,
      forcePasswordChange: Boolean(user.forcePasswordChange),
    };
  }

  /**
   * Validate a token and return the user
   */
  async validateToken(token: string): Promise<User | null> {
    if (!token) return null;

    const [user] = await db.select().from(users).where(eq(users.token, token));
    return user || null;
  }

  /**
   * Logout (invalidate token)
   */
  async logout(token: string): Promise<void> {
    await db.update(users).set({ token: null }).where(eq(users.token, token));
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || null;
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user || null;
  }

  /**
   * Validate password strength requirements
   */
  private validatePasswordStrength(password: string): void {
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      throw new Error('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      throw new Error('Password must contain at least one number');
    }
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    // Verify user exists
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password strength
    this.validatePasswordStrength(newPassword);

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update database
    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        forcePasswordChange: false,
        updatedAt: Date.now(),
      })
      .where(eq(users.id, userId));
  }

  /**
   * List all users (sorted by createdAt desc)
   */
  async listAllUsers(): Promise<Omit<User, 'passwordHash' | 'token'>[]> {
    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        status: users.status,
        forcePasswordChange: users.forcePasswordChange,
        deactivatedAt: users.deactivatedAt,
        deactivatedBy: users.deactivatedBy,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    return allUsers;
  }

  /**
   * Update username (checks for duplicates)
   */
  async updateUsername(userId: string, newUsername: string): Promise<Omit<User, 'passwordHash' | 'token'>> {
    // Check if new username already exists (excluding current user)
    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.username, newUsername), ne(users.id, userId)));

    if (existing) {
      throw new Error('Username already exists');
    }

    // Update username
    const [updatedUser] = await db
      .update(users)
      .set({
        username: newUsername,
        updatedAt: Date.now(),
      })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        username: users.username,
        role: users.role,
        status: users.status,
        forcePasswordChange: users.forcePasswordChange,
        deactivatedAt: users.deactivatedAt,
        deactivatedBy: users.deactivatedBy,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    if (!updatedUser) {
      throw new Error('User not found');
    }

    return updatedUser;
  }

  /**
   * Reset user password (optionally set new password, always sets forcePasswordChange)
   */
  async resetUserPassword(userId: string, newPassword?: string): Promise<Omit<User, 'passwordHash' | 'token'>> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const updates: Partial<NewUser> = {
      forcePasswordChange: true,
      updatedAt: Date.now(),
    };

    // If a new password is provided, hash it
    if (newPassword) {
      updates.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    }

    const [updatedUser] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        username: users.username,
        role: users.role,
        status: users.status,
        forcePasswordChange: users.forcePasswordChange,
        deactivatedAt: users.deactivatedAt,
        deactivatedBy: users.deactivatedBy,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    return updatedUser;
  }

  /**
   * Deactivate user (soft delete)
   */
  async deactivateUser(userId: string, deactivatedBy: string): Promise<Omit<User, 'passwordHash' | 'token'>> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const [updatedUser] = await db
      .update(users)
      .set({
        status: 'inactive',
        deactivatedAt: Date.now(),
        deactivatedBy,
        updatedAt: Date.now(),
      })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        username: users.username,
        role: users.role,
        status: users.status,
        forcePasswordChange: users.forcePasswordChange,
        deactivatedAt: users.deactivatedAt,
        deactivatedBy: users.deactivatedBy,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    return updatedUser;
  }

  /**
   * Get count of resources owned by user (repositories and workspaces)
   */
  async getUserResourceCount(userId: string): Promise<{ repositories: number; workspaces: number }> {
    // Count repositories owned by user
    const [repoCount] = await db
      .select({
        count: db.$count(repositories.id),
      })
      .from(repositories)
      .where(eq(repositories.userId, userId));

    // Count workspaces owned by user's repositories
    const [workspaceCount] = await db
      .select({
        count: db.$count(workspaces.id),
      })
      .from(workspaces)
      .innerJoin(repositories, eq(workspaces.repositoryId, repositories.id))
      .where(eq(repositories.userId, userId));

    return {
      repositories: repoCount?.count ?? 0,
      workspaces: workspaceCount?.count ?? 0,
    };
  }

  /**
   * Delete user (hard delete, checks for owned resources first)
   */
  async deleteUser(userId: string): Promise<void> {
    // Check for owned resources
    const resourceCount = await this.getUserResourceCount(userId);

    if (resourceCount.repositories > 0 || resourceCount.workspaces > 0) {
      throw new Error(
        `Cannot delete user: owns ${resourceCount.repositories} repositories and ${resourceCount.workspaces} workspaces`
      );
    }

    // Hard delete user
    await db.delete(users).where(eq(users.id, userId));
  }

  /**
   * Generate a secure random token
   */
  private generateToken(): string {
    return `sh_${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`;
  }
}

// Singleton instance
let authServiceInstance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService();
  }
  return authServiceInstance;
}
