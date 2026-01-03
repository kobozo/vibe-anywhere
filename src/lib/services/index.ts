// Export all services
export { GitService, getGitService } from './git-service';
export { ContainerService, getContainerService } from './container-service';
export { SessionService, getSessionService } from './session-service';
export { AuthService, getAuthService, type AuthResult } from './auth-service';

// New v2 services
export { RepositoryService, getRepositoryService } from './repository-service';
export { WorkspaceService, getWorkspaceService } from './workspace-service';
export { TabService, getTabService } from './tab-service';
export { SSHKeyService, getSSHKeyService } from './ssh-key-service';
export { TabTemplateService, getTabTemplateService, DEFAULT_TEMPLATES } from './tab-template-service';
export { getTabStreamManager } from './tab-stream-manager';
