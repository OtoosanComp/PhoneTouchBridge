import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRequestCloudCandidates } from '../src/card-intelligence/cloud-policy.mjs';

test('cloud recognition is disabled unless the user explicitly opts in', () => {
  assert.equal(shouldRequestCloudCandidates(), false);
  assert.equal(shouldRequestCloudCandidates({ useCloud: false }), false);
  assert.equal(shouldRequestCloudCandidates({ useCloud: true }), true);
});
