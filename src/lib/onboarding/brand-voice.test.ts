import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandVoiceFromOnboarding } from './brand-voice';

const unchained = {
  name: 'Unchained Coffee',
  industry: 'Coffee Shop',
  services: ['coffee', 'espresso'],
  geographicMarket: 'Direct-to-consumer online, shipping across the United States',
  primaryGoal:
    'Grow online coffee sales and recurring subscription orders from repeat customers who value traceable, direct-trade beans',
  primaryCta: 'Shop the latest single-origin Colombian coffee',
};

test('sample posts stay grammatical with full-sentence intake answers', () => {
  const bv = brandVoiceFromOnboarding(unchained);
  assert.deepEqual(bv.samplePosts, [
    'Unchained Coffee is built around coffee and espresso. Shop the latest single-origin Colombian coffee.',
    'Looking for a coffee shop you can trust? Keep Unchained Coffee in mind. Shop the latest single-origin Colombian coffee.',
  ]);
});

test('regression: long market/goal are not jammed into sample posts', () => {
  const bv = brandVoiceFromOnboarding(unchained);
  const joined = bv.samplePosts.join('\n');
  // The old template produced "helps <market> with <service>" and "when <goal>".
  assert.doesNotMatch(joined, /helps Direct-to-consumer/);
  assert.doesNotMatch(joined, /when Grow online coffee sales/);
  assert.ok(!joined.includes(unchained.geographicMarket));
  assert.ok(!joined.includes(unchained.primaryGoal));
});

test('long-form market, goal, and cta live in the dos directives', () => {
  const bv = brandVoiceFromOnboarding(unchained);
  assert.ok(bv.dos.includes('Only reference coffee when supported by the source material.'));
  assert.ok(
    bv.dos.some((d) => d.startsWith('Focus on this geographic market: Direct-to-consumer online')),
  );
  assert.ok(bv.dos.some((d) => d.startsWith('Optimize toward: Grow online coffee sales')));
  assert.ok(bv.dos.some((d) => d.startsWith('Use this primary call to action: Shop the latest')));
});

test('degrades cleanly with no services, category, or cta', () => {
  const bv = brandVoiceFromOnboarding({
    name: 'Acme',
    industry: '',
    services: [],
    geographicMarket: '',
    primaryGoal: '',
    primaryCta: '',
  });
  assert.deepEqual(bv.samplePosts, [
    'Acme is built around what we do. Reach out to learn more.',
    "Keep Acme in mind when you're ready.",
  ]);
  // No leftover template placeholders or dangling punctuation.
  for (const post of bv.samplePosts) {
    assert.doesNotMatch(post, /undefined|\bwith \./);
    assert.match(post, /[.?]$/);
  }
});

test('services phrase joins two and three-plus naturally, deduped', () => {
  const two = brandVoiceFromOnboarding({ ...unchained, services: ['Coffee', 'coffee', 'espresso'] });
  assert.match(two.samplePosts[0], /built around coffee and espresso\./i);

  const three = brandVoiceFromOnboarding({ ...unchained, services: ['coffee', 'tea', 'espresso'] });
  assert.match(three.samplePosts[0], /built around coffee, tea, and espresso\./);
});
