import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorized } from '../netlify/functions/lib/access.mjs';
test('private function access token is required and compared safely', () => {
  assert.equal(isAuthorized(undefined, 'a'.repeat(32)), false);
  assert.equal(isAuthorized('a'.repeat(32), undefined), false);
  assert.equal(isAuthorized('b'.repeat(32), 'a'.repeat(32)), false);
  assert.equal(isAuthorized('a'.repeat(32), 'a'.repeat(32)), true);
  assert.equal(isAuthorized('short', 'a'.repeat(32)), false);
});
