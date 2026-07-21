import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInstagramCaption,
  parseInstagramId,
  parseInstagramPermalink,
  planInstagramMedia,
} from './data/instagram-mapping';

test('parseInstagramId requires a non-empty id', () => {
  assert.deepEqual(parseInstagramId({ id: '17900000000000000' }), { id: '17900000000000000' });
  assert.equal(parseInstagramId({ id: '' }), null);
  assert.equal(parseInstagramId({}), null);
  assert.equal(parseInstagramId(null), null);
});

test('parseInstagramPermalink extracts a permalink when present', () => {
  assert.equal(
    parseInstagramPermalink({ permalink: 'https://www.instagram.com/p/ABC123/' }),
    'https://www.instagram.com/p/ABC123/',
  );
  assert.equal(parseInstagramPermalink({}), null);
  assert.equal(parseInstagramPermalink(null), null);
});

test('buildInstagramCaption caps hashtags at 30 and length at 2200', () => {
  const caption = buildInstagramCaption('Cold brew is here.', ['#coffee', '#coldbrew']);
  assert.equal(caption, 'Cold brew is here.\n\n#coffee #coldbrew');

  const manyTags = Array.from({ length: 40 }, (_, i) => `#tag${i}`);
  const capped = buildInstagramCaption('Hi', manyTags);
  assert.equal(capped.split('\n\n')[1].split(' ').length, 30);

  const long = buildInstagramCaption('x'.repeat(3000), []);
  assert.equal(long.length, 2200);
});

test('planInstagramMedia routes by usable image count', () => {
  assert.deepEqual(planInstagramMedia([]), { kind: 'none' });
  assert.deepEqual(planInstagramMedia([null, '', '  ']), { kind: 'none' });
  assert.deepEqual(planInstagramMedia(['https://img/1.png']), {
    kind: 'single',
    imageUrl: 'https://img/1.png',
  });
  assert.deepEqual(planInstagramMedia(['https://img/1.png', 'https://img/2.png']), {
    kind: 'carousel',
    imageUrls: ['https://img/1.png', 'https://img/2.png'],
  });
});

test('planInstagramMedia drops blanks and caps a carousel at 10', () => {
  const mixed = planInstagramMedia(['https://img/1.png', null, 'https://img/2.png']);
  assert.deepEqual(mixed, { kind: 'carousel', imageUrls: ['https://img/1.png', 'https://img/2.png'] });

  const many = Array.from({ length: 14 }, (_, i) => `https://img/${i}.png`);
  const plan = planInstagramMedia(many);
  assert.equal(plan.kind, 'carousel');
  assert.equal(plan.kind === 'carousel' && plan.imageUrls.length, 10);
  assert.equal(plan.kind === 'carousel' && plan.imageUrls[9], 'https://img/9.png');
});
