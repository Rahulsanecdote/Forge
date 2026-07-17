import assert from 'node:assert/strict';
import test from 'node:test';
import { hasToolAuthority } from './authority-policy';

test('active agents need an allowed permission at or above the tool requirement', () => {
  assert.equal(
    hasToolAuthority({
      agentStatus: 'active',
      allowed: true,
      grantedPermission: 'execute',
      requiredPermission: 'execute',
    }),
    true,
  );
  assert.equal(
    hasToolAuthority({
      agentStatus: 'active',
      allowed: true,
      grantedPermission: 'admin',
      requiredPermission: 'execute',
    }),
    true,
  );
  assert.equal(
    hasToolAuthority({
      agentStatus: 'active',
      allowed: true,
      grantedPermission: 'read',
      requiredPermission: 'execute',
    }),
    false,
  );
});

test('unknown, suspended, and explicitly denied agents fail closed', () => {
  assert.equal(
    hasToolAuthority({
      agentStatus: null,
      allowed: true,
      grantedPermission: 'admin',
      requiredPermission: 'read',
    }),
    false,
  );
  assert.equal(
    hasToolAuthority({
      agentStatus: 'suspended',
      allowed: true,
      grantedPermission: 'admin',
      requiredPermission: 'read',
    }),
    false,
  );
  assert.equal(
    hasToolAuthority({
      agentStatus: 'active',
      allowed: false,
      grantedPermission: 'admin',
      requiredPermission: 'read',
    }),
    false,
  );
});
