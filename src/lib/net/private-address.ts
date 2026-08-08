import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Shared SSRF guard. Any place Forge fetches an operator- or client-supplied URL must
// check the resolved address, not just the string: a public hostname can resolve to a
// loopback, link-local, or cloud-metadata address. `isPrivateAddress` is pure so it can be
// unit-tested; `resolvesToPrivateAddress` adds the DNS resolution around it.

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  // IPv4-mapped IPv6 (::ffff:127.0.0.1) — unwrap and re-check as IPv4.
  if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7));

  const version = isIP(address);

  // Scoped to genuine IPv6 literals so a hostname starting with these characters
  // (e.g. "fdn.example.com") can never be misread as an address prefix.
  if (version === 6) {
    return (
      normalized === '::1' || // loopback
      normalized === '::' || // unspecified
      /^f[cd]/.test(normalized) || // unique-local fc00::/7
      /^fe[89ab]/.test(normalized) || // link-local fe80::/10
      /^ff/.test(normalized) // multicast ff00::/8 (e.g. ff02::1 all-nodes)
    );
  }

  if (version !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return (
    a === 0 || // this-network
    a === 10 || // private
    a === 127 || // loopback
    a >= 224 || // multicast + reserved
    (a === 169 && b === 254) || // link-local, incl. cloud metadata (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
  );
}

// Hostnames that never need a DNS round-trip to reject.
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal');
}

// True when the hostname resolves to any private/link-local address (or resolves to
// nothing). Fails closed: a DNS error is treated as private rather than allowed.
//
// Known limitation — DNS rebinding: this validates the hostname, then `fetch` resolves it
// again independently, so a hostname that answers with a public address here and a private
// one microseconds later would slip through. Closing that gap means pinning the vetted
// address onto the connection (a custom undici dispatcher) for every outbound fetch, which
// is deliberately out of scope here. The exposure is bounded: the alert webhook URL is
// operator-set env config, not attacker-supplied.
export async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  if (isPrivateHostname(hostname)) return true;
  if (isIP(hostname)) return isPrivateAddress(hostname);
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address));
  } catch {
    return true;
  }
}
