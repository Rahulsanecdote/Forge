-- Fleetlog (#52) added log_failure + review_failures to the code registry, but
-- the authority layer only permits tools registered in forge_tools, and the
-- foundation seed (20260717053823) predates them — without this registration
-- every Fleetlog call fails closed with "unregistered tool". Register both
-- tools and grant the default agent execute permission, mirroring the
-- foundation pattern.
insert into public.forge_tools (name, required_permission)
values
  ('log_failure', 'execute'),
  ('review_failures', 'execute')
on conflict (name) do nothing;

insert into public.forge_agent_tool_permissions (agent_id, tool_name, permission_level, allowed)
select agent.id, tool.name, 'execute', true
from public.forge_agents agent
cross join public.forge_tools tool
where agent.key = 'default'
  and tool.name in ('log_failure', 'review_failures')
on conflict (agent_id, tool_name) do nothing;
