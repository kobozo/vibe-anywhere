import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { gitIdentities, type GitIdentity, type NewGitIdentity } from '@/lib/db/schema';

export interface CreateGitIdentityInput {
  name: string;
  gitName: string;
  gitEmail: string;
  isDefault?: boolean;
}

export interface UpdateGitIdentityInput {
  name?: string;
  gitName?: string;
  gitEmail?: string;
}

export class GitIdentityService {
  /**
   * Create a new git identity for a user
   */
  async createIdentity(userId: string, input: CreateGitIdentityInput): Promise<GitIdentity> {
    // Validate email format (basic check)
    if (input.gitEmail && !input.gitEmail.includes('@')) {
      throw new Error('Invalid email format');
    }

    // If this is marked as default, unset other defaults first
    if (input.isDefault) {
      await this.clearDefaultIdentity(userId);
    }

    const [identity] = await db
      .insert(gitIdentities)
      .values({
        userId,
        name: input.name,
        gitName: input.gitName,
        gitEmail: input.gitEmail,
        isDefault: input.isDefault || false,
      })
      .returning();

    return identity;
  }

  /**
   * Get a git identity by ID
   */
  async getIdentity(identityId: string): Promise<GitIdentity | null> {
    const [identity] = await db
      .select()
      .from(gitIdentities)
      .where(eq(gitIdentities.id, identityId));
    return identity || null;
  }

  /**
   * List all git identities for a user
   */
  async listIdentities(userId: string): Promise<GitIdentity[]> {
    return db
      .select()
      .from(gitIdentities)
      .where(eq(gitIdentities.userId, userId))
      .orderBy(gitIdentities.name);
  }

  /**
   * Get the default git identity for a user
   */
  async getDefaultIdentity(userId: string): Promise<GitIdentity | null> {
    const [identity] = await db
      .select()
      .from(gitIdentities)
      .where(and(eq(gitIdentities.userId, userId), eq(gitIdentities.isDefault, true)));
    return identity || null;
  }

  /**
   * Update a git identity
   */
  async updateIdentity(
    identityId: string,
    input: UpdateGitIdentityInput
  ): Promise<GitIdentity> {
    // Validate email format if provided
    if (input.gitEmail && !input.gitEmail.includes('@')) {
      throw new Error('Invalid email format');
    }

    const [updated] = await db
      .update(gitIdentities)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(gitIdentities.id, identityId))
      .returning();

    if (!updated) {
      throw new Error('Git identity not found');
    }

    return updated;
  }

  /**
   * Delete a git identity
   */
  async deleteIdentity(identityId: string): Promise<void> {
    await db.delete(gitIdentities).where(eq(gitIdentities.id, identityId));
  }

  /**
   * Set a git identity as the default for a user
   */
  async setDefaultIdentity(userId: string, identityId: string): Promise<void> {
    // First, unset all defaults for this user
    await this.clearDefaultIdentity(userId);

    // Then set the new default
    await db
      .update(gitIdentities)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(gitIdentities.id, identityId), eq(gitIdentities.userId, userId)));
  }

  /**
   * Clear the default identity for a user (make none default)
   */
  async clearDefaultIdentity(userId: string): Promise<void> {
    await db
      .update(gitIdentities)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(gitIdentities.userId, userId));
  }

  /**
   * Check if a user owns a specific identity
   */
  async isUserOwner(userId: string, identityId: string): Promise<boolean> {
    const [identity] = await db
      .select()
      .from(gitIdentities)
      .where(and(eq(gitIdentities.id, identityId), eq(gitIdentities.userId, userId)));
    return !!identity;
  }
}

// Singleton instance
let gitIdentityServiceInstance: GitIdentityService | null = null;

export function getGitIdentityService(): GitIdentityService {
  if (!gitIdentityServiceInstance) {
    gitIdentityServiceInstance = new GitIdentityService();
  }
  return gitIdentityServiceInstance;
}
