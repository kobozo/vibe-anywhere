import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db, users, type User, type NewUser } from '@/lib/db';
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
  async createUser(username: string, password: string): Promise<AuthResult> {
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
        forcePasswordChange: 0,  // SQLite uses 0/1 for boolean
        updatedAt: Date.now(),
      })
      .where(eq(users.id, userId));
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
