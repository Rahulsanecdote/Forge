export interface SourceOffer {
  url: string;
  // True when this deployment declared its own source, i.e. it is a modified fork rather
  // than a stock copy pointing at upstream.
  modified: boolean;
}

// Resolves the source location offered under AGPL-3.0 section 13.
//
// Unset means an unmodified deployment, where linking upstream is correct. Set-but-invalid
// is an operator mistake, and the two failure modes are not equally recoverable: silently
// falling back to upstream would advertise a *wrong* source for a modified fork — a
// compliance failure that looks fine on the page — so a bad value throws instead. Relative
// and non-http(s) values are rejected for the same reason: href="/foo" or href="" resolves
// against the current page and offers nothing at all.
export function resolveSourceOffer(
  configured: string | null | undefined,
  fallbackUrl: string,
): SourceOffer {
  const trimmed = configured?.trim();
  if (!trimmed) return { url: fallbackUrl, modified: false };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `FORGE_SOURCE_URL is not a valid absolute URL: ${JSON.stringify(trimmed)}. ` +
        'AGPL-3.0 section 13 requires this deployment to offer its source; unset the ' +
        'variable if this deployment is unmodified.',
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(
      `FORGE_SOURCE_URL must be an http(s) URL, got ${JSON.stringify(parsed.protocol)}.`,
    );
  }

  return { url: parsed.toString(), modified: true };
}
