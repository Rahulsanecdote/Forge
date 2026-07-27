import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findBannedPhraseViolations,
  formatReportPackage,
  parseKeywordResearchOutput,
  parseReportOutput,
} from './run-output';

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
        opportunity_score: 67,
        opportunity_label: 'high',
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
        opportunityScore: 67,
        opportunityLabel: 'high',
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

test('parses report output for dashboard report preview', () => {
  const output = parseReportOutput({
    period: 'July 2026',
    executive_summary: 'Reach improved while review volume needs attention.',
    whats_working: ['Instagram posts are driving steady engagement.'],
    needs_attention: ['Google review velocity is below target.'],
    recommended_actions: ['Run a review request batch this week.'],
  });

  assert.deepEqual(output, {
    period: 'July 2026',
    executiveSummary: 'Reach improved while review volume needs attention.',
    whatsWorking: ['Instagram posts are driving steady engagement.'],
    needsAttention: ['Google review velocity is below target.'],
    recommendedActions: ['Run a review request batch this week.'],
  });
});

test('formats a report package for operator and client copy actions', () => {
  const packageText = formatReportPackage({
    period: 'July 2026',
    executiveSummary: 'Reach improved while review volume needs attention.',
    whatsWorking: ['Instagram posts are driving steady engagement.'],
    needsAttention: ['Google review velocity is below target.'],
    recommendedActions: ['Run a review request batch this week.'],
  });

  assert.equal(
    packageText,
    [
      'Performance Report - July 2026',
      '',
      'Executive Summary',
      'Reach improved while review volume needs attention.',
      '',
      "What's Working",
      '- Instagram posts are driving steady engagement.',
      '',
      'Needs Attention',
      '- Google review velocity is below target.',
      '',
      'Recommended Actions',
      '- Run a review request batch this week.',
    ].join('\n'),
  );
});
