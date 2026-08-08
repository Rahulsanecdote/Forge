import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, isPrivateHostname, resolvesToPrivateAddress } from './private-address';

test('blocks loopback, private, link-local and CGNAT IPv4 ranges', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata — the one that matters most
    '0.0.0.0',
    '224.0.0.1',
    '100.64.0.1',
  ]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
});

test('allows ordinary public IPv4', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '192.169.0.1', '100.63.255.255']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test('blocks IPv6 loopback, unique-local, link-local, and IPv4-mapped loopback', () => {
  for (const ip of ['::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  assert.equal(isPrivateAddress('2606:4700:4700::1111'), false);
});

test('isPrivateHostname catches local suffixes without DNS', () => {
  for (const h of ['localhost', 'LOCALHOST', 'db.local', 'metadata.internal']) {
    assert.equal(isPrivateHostname(h), true, h);
  }
  assert.equal(isPrivateHostname('example.com'), false);
});

test('resolvesToPrivateAddress short-circuits literal IPs and local hostnames', async () => {
  assert.equal(await resolvesToPrivateAddress('169.254.169.254'), true);
  assert.equal(await resolvesToPrivateAddress('127.0.0.1'), true);
  assert.equal(await resolvesToPrivateAddress('localhost'), true);
  assert.equal(await resolvesToPrivateAddress('8.8.8.8'), false);
});

test('resolvesToPrivateAddress fails closed on an unresolvable host', async () => {
  assert.equal(
    await resolvesToPrivateAddress('this-host-does-not-exist.invalid'),
    true,
    'DNS failure must be treated as private, not allowed',
  );
});
