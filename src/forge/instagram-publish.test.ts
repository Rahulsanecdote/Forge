import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInstagramCaption,
  parseInstagramId,
  parseInstagramPermalink,
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
