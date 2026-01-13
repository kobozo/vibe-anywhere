import { eq, and, desc } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db, userAuditLog, type UserAuditLog, type NewUserAuditLog, type UserAuditAction } from '@/lib/db';

export interface AuditLogFilters {
  action?: UserAuditAction;
  targetUserId?: string;
  performedBy?: string;
  limit?: number;
}

export class AuditLogService {
  /**
   * Log a user management action
   * @param action - The type of action performed
   * @param performedBy - ID of user who performed the action (null for system actions)
   * @param targetUser - Object with id and username of the user being acted upon
   * @param details - Additional details about the action (optional)
   * @param request - NextRequest object to extract IP and user agent (optional)
   * @returns The created audit log entry
   */
  async logUserAction(
    action: UserAuditAction,
    performedBy: string | null,
    targetUser: { id: string | null; username: string },
    details?: string,
    request?: NextRequest
  ): Promise<UserAuditLog> {
    // Extract IP address from request headers
    let ipAddress: string | null = null;
    if (request) {
      // Try x-forwarded-for first (for proxies/load balancers)
      const forwardedFor = request.headers.get('x-forwarded-for');
      if (forwardedFor) {
        // x-forwarded-for can contain multiple IPs, take the first one
        ipAddress = forwardedFor.split(',')[0].trim();
      } else {
        // Fallback to x-real-ip
        ipAddress = request.headers.get('x-real-ip');
      }
    }

    // Extract user agent from request headers
    const userAgent = request?.headers.get('user-agent') || null;

    // Insert audit log entry
    const [auditLog] = await db
      .insert(userAuditLog)
      .values({
        action,
        performedBy,
        targetUserId: targetUser.id,
        targetUsername: targetUser.username,
        details: details || null,
        ipAddress,
        userAgent,
      })
      .returning();

    return auditLog;
  }

  /**
   * Get user audit logs with optional filters
   * @param filters - Optional filters for querying audit logs
   * @returns Array of audit log entries
   */
  async getUserAuditLogs(filters?: AuditLogFilters): Promise<UserAuditLog[]> {
    const limit = filters?.limit || 100;

    // Build where conditions
    const conditions = [];
    if (filters?.action) {
      conditions.push(eq(userAuditLog.action, filters.action));
    }
    if (filters?.targetUserId) {
      conditions.push(eq(userAuditLog.targetUserId, filters.targetUserId));
    }
    if (filters?.performedBy) {
      conditions.push(eq(userAuditLog.performedBy, filters.performedBy));
    }

    // Query with filters
    let query = db
      .select()
      .from(userAuditLog)
      .orderBy(desc(userAuditLog.timestamp))
      .limit(limit);

    // Apply where conditions if any
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const logs = await query;
    return logs;
  }
}

// Singleton instance
let auditLogServiceInstance: AuditLogService | null = null;

export function getAuditLogService(): AuditLogService {
  if (!auditLogServiceInstance) {
    auditLogServiceInstance = new AuditLogService();
  }
  return auditLogServiceInstance;
}
