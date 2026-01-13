// Export all services
export { GitService, getGitService } from './git-service';
export { SessionService, getSessionService } from './session-service';
export { AuthService, getAuthService, type AuthResult } from './auth-service';
export { AuditLogService, getAuditLogService } from './audit-log-service';

// New v2 services
export { RepositoryService, getRepositoryService } from './repository-service';
export { WorkspaceService, getWorkspaceService } from './workspace-service';
export { TabService, getTabService } from './tab-service';
export { SSHKeyService, getSSHKeyService } from './ssh-key-service';
export { TabTemplateService, getTabTemplateService, DEFAULT_TEMPLATES } from './tab-template-service';
export { TemplateService, getTemplateService } from './template-service';
export { getTabStreamManager } from './tab-stream-manager';
export { AgentRegistry, getAgentRegistry } from './agent-registry';
export { ContainerStatusSyncService, getContainerStatusSyncService } from './container-status-sync';
export { EnvVarSyncService, getEnvVarSyncService } from './env-var-sync-service';

// Container backend (abstraction layer)
export {
  getContainerBackend,
  getContainerBackendAsync,
  initializeBackend,
  getContainerService, // Backwards compatibility
  type IContainerBackend,
  type ContainerBackendType,
  type ContainerConfig,
  type ContainerInfo,
  type ContainerStream,
  type ExecResult,
} from '@/lib/container';
