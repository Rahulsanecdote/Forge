import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSourceOffer } from './source-url';

const UPSTREAM = 'https://github.com/Rahulsanecdote/Forge';

test('an unset source URL offers upstream and is not labelled modified', () => {
  assert.deepEqual(resolveSourceOffer(undefined, UPSTREAM), {
    url: UPSTREAM,
    modified: false,
  });
  assert.deepEqual(resolveSourceOffer(null, UPSTREAM), { url: UPSTREAM, modified: false });
});

test('a blank source URL falls back rather than rendering an empty link', () => {
  // href="" resolves to the current page, so a whitespace-only value would present a
  // source offer that silently leads nowhere.
  assert.deepEqual(resolveSourceOffer('', UPSTREAM), { url: UPSTREAM, modified: false });
  assert.deepEqual(resolveSourceOffer('   \t\n ', UPSTREAM), {
    url: UPSTREAM,
    modified: false,
  });
});

test("a fork's own source URL is offered and labelled modified", () => {
  assert.deepEqual(resolveSourceOffer('  https://git.example.com/fork  ', UPSTREAM), {
    url: 'https://git.example.com/fork',
    modified: true,
  });
});

test('http is accepted for self-hosted forges on a private network', () => {
  assert.equal(resolveSourceOffer('http://gitea.internal/forge', UPSTREAM).url,
    'http://gitea.internal/forge');
});

test('a relative path is rejected instead of silently offering upstream', () => {
  // Falling back here would advertise upstream as a modified fork's source — a compliance
  // failure that looks correct on the page.
  assert.throws(() => resolveSourceOffer('/source', UPSTREAM), /not a valid absolute URL/);
  assert.throws(() => resolveSourceOffer('github.com/x/y', UPSTREAM), /not a valid absolute URL/);
});

test('a URL carrying credentials is rejected without echoing them', () => {
  // The resolved URL goes out in a redirect to every visitor, so a clone URL pasted from a
  // private forge would publish its token.
  const withToken = 'https://deploy-user:deploy-token@git.example.com/forge';
  assert.throws(
    () => resolveSourceOffer(withToken, UPSTREAM),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /must not contain credentials/);
      assert.doesNotMatch(error.message, /deploy-token/);
      return true;
    },
  );
  assert.throws(
    () => resolveSourceOffer('https://user@git.example.com/forge', UPSTREAM),
    /must not contain credentials/,
  );
});

test('a non-http scheme is rejected', () => {
  assert.throws(
    () => resolveSourceOffer('javascript:alert(1)', UPSTREAM),
    /must be an http\(s\) URL/,
  );
  assert.throws(() => resolveSourceOffer('ftp://example.com/src', UPSTREAM), /must be an http/);
});
