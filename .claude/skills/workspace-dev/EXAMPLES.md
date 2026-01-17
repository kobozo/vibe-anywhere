# Workspace Examples

## Basic Workspace Creation
```typescript
const workspace = await workspaceService.createWorkspace(repositoryId, {
  name: 'feature-auth',
  branchName: 'feature/auth',
});
```

## With Advanced Options
```typescript
const workspace = await workspaceService.createWorkspace(repositoryId, {
  name: 'production-debug',
  branchName: 'main',
  staticIpAddress: '192.168.3.100/24',
  staticIpGateway: '192.168.3.1',
  forcedVmid: 200,
  overrideTemplateId: 'custom-template-id',
});
```

## Start Container
```typescript
const workspace = await workspaceService.startContainer(workspaceId);
// Returns workspace with containerStatus: 'running'
```
