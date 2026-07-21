import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacebookMessage, facebookPostUrl, parseFacebookPostResponse } from './data/meta-mapping';

test('parseFacebookPostResponse requires a non-empty id', () => {
  assert.deepEqual(parseFacebookPostResponse({ id: '123_456' }), { id: '123_456' });
  assert.equal(parseFacebookPostResponse({ id: '' }), null);
  assert.equal(parseFacebookPostResponse({}), null);
  assert.equal(parseFacebookPostResponse(null), null);
});

test('facebookPostUrl builds a permalink from the composite id', () => {
  assert.equal(facebookPostUrl('123_456'), 'https://www.facebook.com/123_456');
});

test('buildFacebookMessage joins caption and hashtags, dropping empties', () => {
  assert.equal(
    buildFacebookMessage('Fresh cold brew this week.', ['#coldbrew', '#coffee']),
    'Fresh cold brew this week.\n\n#coldbrew #coffee',
  );
  assert.equal(buildFacebookMessage('Just the caption.', []), 'Just the caption.');
  assert.equal(buildFacebookMessage('  Trimmed.  ', ['   ']), 'Trimmed.');
});
