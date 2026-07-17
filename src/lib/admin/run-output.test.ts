import assert from 'node:assert/strict';
import test from 'node:test';
import { findBannedPhraseViolations } from './run-output';

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
