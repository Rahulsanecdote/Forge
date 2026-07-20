import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDataForSeoKeywordOverviewPayload,
  normalizeKeywordList,
  parseDataForSeoKeywordOverviewResponse,
} from './data/keywords';

test('normalizes keyword lists for DataForSEO limits without duplicates', () => {
  assert.deepEqual(
    normalizeKeywordList([
      ' Cold Brew ',
      'cold   brew',
      'espresso near Jersey City',
      'this keyword is too long because it contains more than ten separate words for the api',
      'x'.repeat(81),
    ]),
    ['cold brew', 'espresso near jersey city'],
  );
});

test('builds DataForSEO keyword overview payload with SERP info for difficulty', () => {
  assert.deepEqual(
    buildDataForSeoKeywordOverviewPayload(['cold brew'], {
      locationCode: 2840,
      languageCode: 'en',
      includeClickstream: true,
    }),
    {
      keywords: ['cold brew'],
      include_serp_info: true,
      include_clickstream_data: true,
      location_code: 2840,
      language_code: 'en',
    },
  );
});

test('parses DataForSEO keyword overview metrics without inventing missing fields', () => {
  const metrics = parseDataForSeoKeywordOverviewResponse({
    status_code: 20000,
    tasks: [
      {
        result: [
          {
            items: [
              {
                keyword: 'cold brew coffee',
                keyword_info: {
                  search_volume: 12100,
                  cpc: 2.31,
                  competition: 0.42,
                  competition_level: 'MEDIUM',
                  monthly_searches: [{ year: 2026, month: 6, search_volume: 12100 }],
                },
                keyword_properties: {
                  keyword_difficulty: 37,
                },
                search_intent_info: {
                  main_intent: 'commercial',
                },
              },
              {
                keyword: 'no data keyword',
                keyword_info: {},
              },
            ],
          },
        ],
      },
    ],
  });

  assert.deepEqual(metrics, [
    {
      keyword: 'cold brew coffee',
      search_volume: 12100,
      keyword_difficulty: 37,
      cpc: 2.31,
      competition: 0.42,
      competition_level: 'MEDIUM',
      search_intent: 'commercial',
      monthly_searches: [{ year: 2026, month: 6, search_volume: 12100 }],
      source: 'dataforseo',
    },
    {
      keyword: 'no data keyword',
      search_volume: null,
      keyword_difficulty: null,
      cpc: null,
      competition: null,
      competition_level: null,
      search_intent: null,
      monthly_searches: [],
      source: 'dataforseo',
    },
  ]);
});
