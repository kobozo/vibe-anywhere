import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db, users, type User, type NewUser } from '@/lib/db';
import { config } from '@/lib/config';
import { v4 as uuidv4 } from 'uuid';

const SALT_ROUNDS = 12;

export interface AuthResult {
  user: Pick<User, 'id' | 'username' | 'createdAt' | 'updatedAt'>;
  token: string;
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
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
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
    await db.update(users).set({ token, updatedAt: Date.now() }).where(eq(users.id, user.id));

    return {
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
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

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update database
    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
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
