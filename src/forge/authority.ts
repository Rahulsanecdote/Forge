import { supabase } from '../supabase';
import { hasToolAuthority } from './authority-policy';
import type { AgentStatus, PermissionLevel } from './authority-policy';

export const DEFAULT_AGENT_KEY = 'default';

export interface ToolAuthority {
  agentId: string;
  agentKey: string;
  requiredPermission: PermissionLevel;
  grantedPermission: PermissionLevel;
  requiresApproval: boolean;
  approvalActionType: string | null;
  verificationGates: unknown[];
  rollbackPolicy: unknown | null;
}

export async function assertToolPermission(params: {
  agentKey: string;
  toolName: string;
}): Promise<ToolAuthority> {
  const { data: agent, error: agentError } = await supabase
    .from('forge_agents')
    .select('id, key, status')
    .eq('key', params.agentKey)
    .maybeSingle();

  if (agentError || !agent) {
    throw new Error(`Agent authority denied: unknown agent "${params.agentKey}".`);
  }

  const { data: registeredTool, error: toolError } = await supabase
    .from('forge_tools')
    .select(
      'name, required_permission, requires_approval, approval_action_type, verification_gates, rollback_policy',
    )
    .eq('name', params.toolName)
    .maybeSingle();

  if (toolError || !registeredTool) {
    throw new Error(`Agent authority denied: unregistered tool "${params.toolName}".`);
  }

  const { data: permission, error: permissionError } = await supabase
    .from('forge_agent_tool_permissions')
    .select('permission_level, allowed')
    .eq('agent_id', agent.id)
    .eq('tool_name', registeredTool.name)
    .maybeSingle();

  if (permissionError || !permission) {
    throw new Error(
      `Agent authority denied: "${params.agentKey}" has no permission for "${params.toolName}".`,
    );
  }

  const authorityInput = {
    agentStatus: agent.status as AgentStatus,
    allowed: permission.allowed,
    grantedPermission: permission.permission_level as PermissionLevel,
    requiredPermission: registeredTool.required_permission as PermissionLevel,
  };

  if (!hasToolAuthority(authorityInput)) {
    throw new Error(
      `Agent authority denied: "${params.agentKey}" cannot execute "${params.toolName}".`,
    );
  }

  const verificationGates = registeredTool.verification_gates;
  if (!Array.isArray(verificationGates)) {
    throw new Error(`Agent authority denied: invalid verification gates for "${params.toolName}".`);
  }

  return {
    agentId: agent.id,
    agentKey: agent.key,
    requiredPermission: authorityInput.requiredPermission,
    grantedPermission: authorityInput.grantedPermission,
    requiresApproval: registeredTool.requires_approval,
    approvalActionType: registeredTool.approval_action_type,
    verificationGates,
    rollbackPolicy: registeredTool.rollback_policy,
  };
}
