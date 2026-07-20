import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';

const MAX_HTML_BYTES = 750_000;
const MAX_VISIBLE_TEXT_CHARS = 40_000;
const MAX_REDIRECTS = 3;
const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'msclkid', 'srsltid']);

const inputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  website: z.string().trim().url().max(500),
});

export interface WebsiteAnalysis {
  businessType: string | null;
  services: string[];
  suggestedCategory: string | null;
  tone: string[];
  locations: number | null;
  summary: string | null;
  sourceUrl: string;
  evidence: string[];
  warnings: string[];
}

interface JsonObject {
  [key: string]: unknown;
}

function withoutTrackingParams(input: URL) {
  const url = new URL(input);
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
      url.searchParams.delete(key);
    }
  }
  return url;
}

export function normalizeWebsiteUrl(value: string) {
  return withoutTrackingParams(new URL(value)).toString();
}

const CATEGORY_RULES = [
  { category: 'Coffee Shop', terms: ['cafeorcoffeeshop', 'coffee shop', 'coffee', 'espresso', 'cafe'] },
  { category: 'Dentist', terms: ['dentist', 'dental clinic', 'dental practice', 'orthodont'] },
  { category: 'Restaurant', terms: ['restaurant', 'food establishment', 'menu', 'dining'] },
  { category: 'Beauty Salon', terms: ['beautysalon', 'hair salon', 'beauty salon', 'hair stylist'] },
  { category: 'Medical Clinic', terms: ['medicalclinic', 'medical clinic', 'health clinic', 'physician'] },
  { category: 'Law Firm', terms: ['legalservice', 'law firm', 'attorney', 'lawyer'] },
  { category: 'Real Estate Agency', terms: ['realestateagent', 'real estate agency', 'realtor'] },
  { category: 'Fitness Center', terms: ['exercisegym', 'healthclub', 'fitness center', 'gym'] },
  { category: 'Software Company', terms: ['softwareapplication', 'software company', 'saas', 'software platform'] },
] as const;

const SERVICE_TERMS = [
  'consultation', 'delivery', 'catering', 'breakfast', 'lunch', 'dinner', 'coffee',
  'espresso', 'pastries', 'cleaning', 'whitening', 'implants', 'orthodontics',
  'haircuts', 'coloring', 'facials', 'massage', 'personal training', 'classes',
  'bookkeeping', 'tax preparation', 'legal advice', 'property management',
] as const;

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const hex = entity[1]?.toLowerCase() === 'x';
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function cleanText(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function visibleBodyText(html: string) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  return cleanText(
    body
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' '),
  ).slice(0, MAX_VISIBLE_TEXT_CHARS);
}

function firstTag(html: string, tag: string) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? cleanText(match[1]) : '';
}

function metaContent(html: string, key: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const property = tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (property?.toLowerCase() !== key.toLowerCase()) continue;
    return decodeHtml(tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] ?? '').trim();
  }
  return '';
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flattenJsonLd(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!isObject(value)) return [];
  const graph = Array.isArray(value['@graph']) ? value['@graph'].flatMap(flattenJsonLd) : [];
  return [value, ...graph];
}

function parseJsonLd(html: string) {
  const scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  return scripts.flatMap((script) => {
    const raw = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      return flattenJsonLd(JSON.parse(raw) as unknown);
    } catch {
      return [];
    }
  });
}

function collectStrings(value: unknown, keys: ReadonlySet<string>, result: string[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, keys, result));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key) && typeof child === 'string' && child.trim()) result.push(child.trim());
    collectStrings(child, keys, result);
  }
}

function collectOfferNames(value: unknown, result: string[], offered = false) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectOfferNames(item, result, offered));
    return;
  }
  if (!isObject(value)) return;
  const type = value['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (
    typeof value.name === 'string' &&
    (offered || types.some((entry) => entry === 'Service' || entry === 'Product'))
  ) {
    result.push(value.name);
  }
  for (const [key, child] of Object.entries(value)) {
    collectOfferNames(child, result, key === 'itemOffered');
  }
}

function unique(values: string[], limit = 8) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value).replace(/[.;,]+$/, '').trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length === limit) break;
  }
  return result;
}

function isBlockedIp(address: string) {
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) return isBlockedIp(normalized.slice(7));
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127);
}

async function assertPublicUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use a public http or https website URL.');
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    throw new Error('Private network addresses are not allowed.');
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedIp(address))) {
    throw new Error('Private network addresses are not allowed.');
  }
}

async function readBoundedHtml(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    const html = await response.text();
    return Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES
      ? Buffer.from(html, 'utf8').subarray(0, MAX_HTML_BYTES).toString('utf8')
      : html;
  }

  const decoder = new TextDecoder();
  let bytesRead = 0;
  let html = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    const remaining = MAX_HTML_BYTES - bytesRead;
    if (remaining <= 0) {
      await reader.cancel().catch(() => undefined);
      break;
    }

    const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    html += decoder.decode(chunk, { stream: value.byteLength <= remaining });
    bytesRead += chunk.byteLength;

    if (value.byteLength > remaining) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }

  return html + decoder.decode();
}

async function fetchWebsite(startUrl: URL) {
  let url = startUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicUrl(url);
    const response = await fetch(url, {
      headers: { 'user-agent': 'ForgeWebsiteAnalyzer/1.0 (+https://forge-agent-ten.vercel.app)' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirects === MAX_REDIRECTS) throw new Error('The website redirected too many times.');
      url = withoutTrackingParams(new URL(location, url));
      continue;
    }
    if (!response.ok) throw new Error(`The website returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) throw new Error('The URL did not return an HTML page.');
    const html = await readBoundedHtml(response);
    return { html, finalUrl: url.toString() };
  }
  throw new Error('The website could not be loaded.');
}

export function analyzeWebsiteHtml(html: string, sourceUrl: string): WebsiteAnalysis {
  const jsonLd = parseJsonLd(html);
  const types = unique(jsonLd.flatMap((item) => {
    const type = item['@type'];
    return Array.isArray(type) ? type.filter((entry): entry is string => typeof entry === 'string') : typeof type === 'string' ? [type] : [];
  }), 20);
  const title = firstTag(html, 'title');
  const description = metaContent(html, 'description') || metaContent(html, 'og:description');
  const headings = unique((html.match(/<h[1-3]\b[^>]*>[\s\S]*?<\/h[1-3]>/gi) ?? []).map(cleanText), 12);
  const bodyText = visibleBodyText(html);
  const pageText = [title, description, ...headings, ...types, bodyText].join(' ').toLowerCase();

  const category = CATEGORY_RULES.find((rule) => rule.terms.some((term) => pageText.includes(term)))?.category ?? null;
  const structuredServices: string[] = [];
  jsonLd.forEach((item) => collectStrings(item, new Set(['serviceType']), structuredServices));
  jsonLd.forEach((item) => {
    for (const key of ['itemOffered', 'itemListElement', 'hasOfferCatalog', 'makesOffer']) {
      collectOfferNames(item[key], structuredServices, key === 'itemOffered');
    }
  });
  const keywordServices = SERVICE_TERMS.filter((term) => pageText.includes(term));
  const services = unique([...structuredServices, ...keywordServices], 8);

  const addresses: string[] = [];
  jsonLd.forEach((item) => {
    const address = item.address;
    if (typeof address === 'string') addresses.push(address);
    if (isObject(address)) addresses.push(JSON.stringify(address));
  });
  const locations = unique(addresses, 50).length || null;

  const tone: string[] = [];
  if (/community|neighborhood|local|family[- ]owned/.test(pageText)) tone.push('community-focused');
  if (/premium|luxury|elevated|exclusive/.test(pageText)) tone.push('premium');
  if (/expert|professional|trusted|certified|evidence[- ]based/.test(pageText)) tone.push('professional');
  if (/friendly|welcoming|warm|comfort/.test(pageText)) tone.push('warm');
  if (/bold|energetic|exciting|fun/.test(pageText)) tone.push('energetic');

  const evidence = unique([
    title ? `Page title: ${title}` : '',
    description ? `Meta description: ${description}` : '',
    types.length ? `Structured data: ${types.join(', ')}` : '',
  ].filter(Boolean), 4);
  const warnings: string[] = [];
  if (!category) warnings.push('No reliable Google category was found; confirm it manually.');
  if (services.length === 0) warnings.push('No explicit services were found on the page.');
  if (tone.length === 0) warnings.push('The page did not contain enough copy to infer a tone.');
  if (locations === null) warnings.push('No structured business address was found.');

  return {
    businessType: category ?? types.find((type) => !['WebSite', 'WebPage', 'Organization'].includes(type)) ?? null,
    services,
    suggestedCategory: category,
    tone: unique(tone, 4),
    locations,
    summary: description || title || null,
    sourceUrl,
    evidence,
    warnings,
  };
}

export async function analyzeWebsite(input: unknown) {
  const parsed = inputSchema.parse(input);
  const requestedUrl = new URL(normalizeWebsiteUrl(parsed.website));
  const { html, finalUrl } = await fetchWebsite(requestedUrl);
  return analyzeWebsiteHtml(html, finalUrl);
}
