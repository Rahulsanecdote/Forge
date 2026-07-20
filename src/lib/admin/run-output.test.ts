import assert from 'node:assert/strict';
import test from 'node:test';
import { findBannedPhraseViolations, parseKeywordResearchOutput } from './run-output';

test('finds current-policy violations in historical structured output', () => {
  const output = {
    posts: [
      {
        caption: 'NutriAI resolves nutrition numbers server-side.',
        hashtags: ['#VerifiedMacros'],
        image_direction: 'Product screenshot',
      },
    ],
  };

  assert.deepEqual(findBannedPhraseViolations(output, ['NutriAI', 'verified macros', 'medical-grade']), [
    'NutriAI',
    'verified macros',
  ]);
});

test('parses keyword research output for dashboard metrics preview', () => {
  const output = parseKeywordResearchOutput({
    topic: 'coffee shop marketing',
    clusters: [
      {
        theme: 'Local coffee demand',
        intent: 'local',
        keywords: ['coffee near me', 'espresso near me'],
        content_angle: 'Build a local landing page around nearby coffee intent.',
      },
    ],
    keyword_metrics: [
      {
        keyword: 'coffee near me',
        search_volume: 74000,
        keyword_difficulty: 48,
        cpc: 1.26,
        competition: 0.41,
        competition_level: 'MEDIUM',
        search_intent: 'commercial',
      },
    ],
    data_source: {
      provider: 'dataforseo',
      configured: true,
      location: '2840',
      language: 'en',
    },
    note: 'Keyword clusters are LLM-generated; metrics are from DataForSEO.',
  });

  assert.deepEqual(output, {
    topic: 'coffee shop marketing',
    clusters: [
      {
        theme: 'Local coffee demand',
        intent: 'local',
        keywords: ['coffee near me', 'espresso near me'],
        contentAngle: 'Build a local landing page around nearby coffee intent.',
      },
    ],
    metrics: [
      {
        keyword: 'coffee near me',
        searchVolume: 74000,
        keywordDifficulty: 48,
        cpc: 1.26,
        competition: 0.41,
        competitionLevel: 'MEDIUM',
        searchIntent: 'commercial',
      },
    ],
    dataSource: {
      provider: 'dataforseo',
      configured: true,
      location: '2840',
      language: 'en',
      warning: null,
    },
    note: 'Keyword clusters are LLM-generated; metrics are from DataForSEO.',
  });
});
