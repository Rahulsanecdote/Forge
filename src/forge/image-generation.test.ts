import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildImagePrompt, imageExtensionForMediaType } from './data/image-prompt';

test('imageExtensionForMediaType maps common media types and defaults to png', () => {
  assert.equal(imageExtensionForMediaType('image/jpeg'), 'jpg');
  assert.equal(imageExtensionForMediaType('image/webp'), 'webp');
  assert.equal(imageExtensionForMediaType('image/png'), 'png');
  assert.equal(imageExtensionForMediaType(undefined), 'png');
  assert.equal(imageExtensionForMediaType('application/octet-stream'), 'png');
});

test('buildImagePrompt composes brand context + direction and omits empty parts', () => {
  const prompt = buildImagePrompt({
    businessName: 'Acme Coffee Co.',
    industry: 'Specialty coffee',
    tone: ['warm', 'community-first'],
    imageDirection: 'A latte on a wooden table by a sunny window',
  });
  assert.match(prompt, /Acme Coffee Co\. \(Specialty coffee\)/);
  assert.match(prompt, /A latte on a wooden table by a sunny window/);
  assert.match(prompt, /Visual mood: warm, community-first/);
  assert.match(prompt, /No watermarks/);

  const minimal = buildImagePrompt({ businessName: 'Solo Shop', imageDirection: 'A storefront' });
  assert.match(minimal, /Marketing photo for Solo Shop\./);
  assert.doesNotMatch(minimal, /Visual mood/); // no tone → omitted
  assert.doesNotMatch(minimal, /\(\)/); // no industry parens
});
