import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSocialPostsPrompt } from './create-social-posts';
import type { ClientContext } from '../types';

const onion: ClientContext = {
  id: 'client-id',
  slug: 'onion',
  name: 'Onion',
  industry: 'AI nutrition platform',
  website: null,
  locations: 1,
  brandVoice: {
    tone: ['science-honest'],
    about: 'The AI proposes food concepts; deterministic systems resolve macros.',
    audience: 'People who want trustworthy nutrition planning.',
    dos: ['distinguish shipped capabilities from planned work'],
    donts: ['make medical claims'],
    samplePosts: ['The model does not calculate your macros.'],
    bannedPhrases: ['NutriAI', 'verified macros'],
  },
};

test('real-run prompt includes the client factual ceiling and writing constraints', () => {
  const prompt = buildSocialPostsPrompt(
    {
      platform: 'google_business',
      count: 3,
      topic: 'product education',
      cta: 'Follow the build',
    },
    onion,
  );

  assert.match(prompt, /FACTUAL CEILING/);
  assert.match(prompt, /deterministic systems resolve macros/);
  assert.match(prompt, /distinguish shipped capabilities from planned work/);
  assert.match(prompt, /make medical claims/);
  assert.match(prompt, /NutriAI, verified macros/);
  assert.match(prompt, /Hashtags should normally be an empty array/);
  assert.match(prompt, /exactly 3 item/);
});

test('performance memory examples are injected when provided', () => {
  const withMemory = buildSocialPostsPrompt(
    { platform: 'instagram', count: 2, topic: 'launch' },
    onion,
    ['instagram · 320 likes, 45 comments — "Cold brew season is here"'],
  );
  assert.match(withMemory, /best-performing past posts/);
  assert.match(withMemory, /Cold brew season is here/);

  const withoutMemory = buildSocialPostsPrompt({ platform: 'instagram', count: 2, topic: 'launch' }, onion);
  assert.doesNotMatch(withoutMemory, /best-performing past posts/);
});
