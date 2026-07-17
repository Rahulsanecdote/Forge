export type PermissionLevel = 'read' | 'execute' | 'admin';
export type AgentStatus = 'active' | 'suspended';

interface AuthorityInput {
  agentStatus: AgentStatus | null;
  allowed: boolean;
  grantedPermission: PermissionLevel;
  requiredPermission: PermissionLevel;
}

const permissionRank: Record<PermissionLevel, number> = {
  read: 1,
  execute: 2,
  admin: 3,
};

export function hasToolAuthority(input: AuthorityInput) {
  return (
    input.agentStatus === 'active' &&
    input.allowed &&
    permissionRank[input.grantedPermission] >= permissionRank[input.requiredPermission]
  );
}
