import { env } from '../../env';

const DATAFORSEO_KEYWORD_OVERVIEW_URL =
  'https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live';

export interface KeywordMetric {
  keyword: string;
  search_volume: number | null;
  keyword_difficulty: number | null;
  cpc: number | null;
  competition: number | null;
  competition_level: string | null;
  search_intent: string | null;
  opportunity_score: number | null;
  opportunity_label: 'high' | 'medium' | 'low' | 'unknown';
  monthly_searches: Array<{ year: number; month: number; search_volume: number }>;
  source: 'dataforseo';
}

export interface KeywordMetricsResult {
  configured: boolean;
  metrics: KeywordMetric[];
  location: string;
  language: string;
  source: 'dataforseo' | 'none';
  warning?: string;
}

interface DataForSeoConfig {
  login: string;
  password: string;
  locationCode?: number;
  locationName?: string;
  languageCode?: string;
  languageName?: string;
  includeClickstream: boolean;
}

interface DataForSeoTaskPayload {
  keywords: string[];
  include_serp_info: boolean;
  include_clickstream_data: boolean;
  location_code?: number;
  location_name?: string;
  language_code?: string;
  language_name?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asInteger(value: unknown): number | null {
  const number = asNumber(value);
  return number === null ? null : Math.trunc(number);
}

function parseLocationCode(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function boolFromEnv(value: string | undefined) {
  return /^(1|true|yes)$/i.test(value ?? '');
}

function resolveDataForSeoConfig(): DataForSeoConfig | null {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return null;

  return {
    login: env.DATAFORSEO_LOGIN,
    password: env.DATAFORSEO_PASSWORD,
    locationCode: parseLocationCode(env.DATAFORSEO_LOCATION_CODE) ?? 2840,
    locationName: env.DATAFORSEO_LOCATION_NAME,
    languageCode: env.DATAFORSEO_LANGUAGE_CODE ?? 'en',
    languageName: env.DATAFORSEO_LANGUAGE_NAME,
    includeClickstream: boolFromEnv(env.DATAFORSEO_INCLUDE_CLICKSTREAM),
  };
}

export function normalizeKeywordList(keywords: string[], limit = 700): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const keyword of keywords) {
    const value = keyword.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!value || value.length > 80 || value.split(' ').length > 10 || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
    if (normalized.length >= limit) break;
  }

  return normalized;
}

export function buildDataForSeoKeywordOverviewPayload(
  keywords: string[],
  config: Pick<
    DataForSeoConfig,
    'locationCode' | 'locationName' | 'languageCode' | 'languageName' | 'includeClickstream'
  >,
): DataForSeoTaskPayload {
  const payload: DataForSeoTaskPayload = {
    keywords,
    include_serp_info: true,
    include_clickstream_data: config.includeClickstream,
  };

  if (config.locationName) payload.location_name = config.locationName;
  else payload.location_code = config.locationCode ?? 2840;

  if (config.languageName) payload.language_name = config.languageName;
  else payload.language_code = config.languageCode ?? 'en';

  return payload;
}

function monthlySearches(value: unknown): KeywordMetric['monthly_searches'] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const year = asInteger(record.year);
      const month = asInteger(record.month);
      const searchVolume = asInteger(record.search_volume);
      if (!year || !month || searchVolume === null) return null;
      return { year, month, search_volume: searchVolume };
    })
    .filter((item): item is KeywordMetric['monthly_searches'][number] => Boolean(item));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function intentScore(intent: string | null) {
  switch (intent?.toLowerCase()) {
    case 'transactional':
      return 20;
    case 'commercial':
      return 16;
    case 'local':
      return 14;
    case 'informational':
      return 7;
    default:
      return 0;
  }
}

function opportunityLabel(score: number | null): KeywordMetric['opportunity_label'] {
  if (score === null) return 'unknown';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

export function scoreKeywordOpportunity(metric: {
  search_volume: number | null;
  keyword_difficulty: number | null;
  cpc: number | null;
  competition: number | null;
  search_intent: string | null;
}): Pick<KeywordMetric, 'opportunity_score' | 'opportunity_label'> {
  const hasEvidence =
    metric.search_volume !== null ||
    metric.keyword_difficulty !== null ||
    metric.cpc !== null ||
    metric.competition !== null ||
    metric.search_intent !== null;

  if (!hasEvidence) {
    return { opportunity_score: null, opportunity_label: 'unknown' };
  }

  const volumeScore =
    metric.search_volume === null ? 0 : clamp(Math.log10(metric.search_volume + 1) * 10, 0, 40);
  const difficultyScore =
    metric.keyword_difficulty === null ? 10 : clamp(30 - metric.keyword_difficulty * 0.3, 0, 30);
  const cpcScore = metric.cpc === null ? 0 : clamp(metric.cpc * 4, 0, 12);
  const paidCompetitionPenalty = metric.competition === null ? 0 : clamp(metric.competition * 8, 0, 8);
  const score = Math.round(
    clamp(volumeScore + difficultyScore + cpcScore + intentScore(metric.search_intent) - paidCompetitionPenalty, 0, 100),
  );

  return { opportunity_score: score, opportunity_label: opportunityLabel(score) };
}

function metricFromItem(item: Record<string, unknown>): KeywordMetric | null {
  const keyword = asString(item.keyword);
  if (!keyword) return null;

  const normalizedInfo = asRecord(item.keyword_info_normalized_with_clickstream);
  const info = normalizedInfo ?? asRecord(item.keyword_info);
  const properties = asRecord(item.keyword_properties);
  const intent = asRecord(item.search_intent_info);

  const base = {
    keyword,
    search_volume: asInteger(info?.search_volume),
    keyword_difficulty: asInteger(properties?.keyword_difficulty),
    cpc: asNumber(info?.cpc),
    competition: asNumber(info?.competition),
    competition_level: asString(info?.competition_level),
    search_intent: asString(intent?.main_intent),
  };

  return {
    ...base,
    ...scoreKeywordOpportunity(base),
    monthly_searches: monthlySearches(info?.monthly_searches),
    source: 'dataforseo',
  };
}

function sortKeywordMetrics(metrics: KeywordMetric[]) {
  return [...metrics].sort((a, b) => {
    const scoreDiff = (b.opportunity_score ?? -1) - (a.opportunity_score ?? -1);
    if (scoreDiff !== 0) return scoreDiff;
    const volumeDiff = (b.search_volume ?? -1) - (a.search_volume ?? -1);
    if (volumeDiff !== 0) return volumeDiff;
    return a.keyword.localeCompare(b.keyword);
  });
}

export function parseDataForSeoKeywordOverviewResponse(payload: unknown): KeywordMetric[] {
  const root = asRecord(payload);
  const tasks = Array.isArray(root?.tasks) ? root.tasks : [];
  const metrics: KeywordMetric[] = [];

  for (const taskValue of tasks) {
    const task = asRecord(taskValue);
    const results = Array.isArray(task?.result) ? task.result : [];
    for (const resultValue of results) {
      const result = asRecord(resultValue);
      const items = Array.isArray(result?.items) ? result.items : [];
      for (const itemValue of items) {
        const item = asRecord(itemValue);
        if (!item) continue;
        const metric = metricFromItem(item);
        if (metric) metrics.push(metric);
      }
    }
  }

  return sortKeywordMetrics(metrics);
}

function summarizeDataForSeoError(payload: unknown, fallback: string) {
  const root = asRecord(payload);
  const statusMessage = asString(root?.status_message);
  const tasks = Array.isArray(root?.tasks) ? root.tasks : [];
  const taskMessages = tasks
    .map((task) => asString(asRecord(task)?.status_message))
    .filter((message): message is string => Boolean(message));
  const message = taskMessages[0] ?? statusMessage ?? fallback;
  return message.length > 240 ? `${message.slice(0, 240)}...` : message;
}

export async function fetchKeywordMetricsFromDataForSeo(keywords: string[]): Promise<KeywordMetricsResult> {
  const config = resolveDataForSeoConfig();
  const normalizedKeywords = normalizeKeywordList(keywords);
  const location = config?.locationName ?? String(config?.locationCode ?? 2840);
  const language = config?.languageName ?? config?.languageCode ?? 'en';

  if (!config) {
    return {
      configured: false,
      metrics: [],
      location: '2840',
      language: 'en',
      source: 'none',
      warning: 'DataForSEO credentials are not configured; returned ideation-only keyword clusters.',
    };
  }

  if (normalizedKeywords.length === 0) {
    return {
      configured: true,
      metrics: [],
      location,
      language,
      source: 'dataforseo',
      warning: 'No keywords met DataForSEO length and word-count limits.',
    };
  }

  const response = await fetch(DATAFORSEO_KEYWORD_OVERVIEW_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${config.login}:${config.password}`).toString('base64')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify([buildDataForSeoKeywordOverviewPayload(normalizedKeywords, config)]),
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    return {
      configured: true,
      metrics: [],
      location,
      language,
      source: 'dataforseo',
      warning: `DataForSEO request failed (${response.status}): ${summarizeDataForSeoError(payload, response.statusText)}`,
    };
  }

  const root = asRecord(payload);
  const statusCode = asInteger(root?.status_code);
  const metrics = parseDataForSeoKeywordOverviewResponse(payload);
  return {
    configured: true,
    metrics,
    location,
    language,
    source: 'dataforseo',
    warning:
      statusCode !== 20000
        ? `DataForSEO returned status ${statusCode ?? 'unknown'}: ${summarizeDataForSeoError(payload, 'Unknown API error')}`
        : undefined,
  };
}
