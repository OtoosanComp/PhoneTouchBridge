import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupDocument, createSyncState, markSyncSuccess, shouldAttemptSync } from '../src/card-intelligence/drive-sync.mjs';

test('Drive backup document contains inventory and stable metadata without changing source records', () => {
  const cards = [{ id: 'TCG-1', name: 'Test', photoId: 'photo-1' }];
  const backup = createBackupDocument(cards, new Date('2026-11-07T12:00:00.000Z'));
  assert.equal(backup.app, 'TCG OP');
  assert.equal(backup.version, 2);
  assert.equal(backup.cards.length, 1);
  assert.equal(backup.exportedAt, '2026-11-07T12:00:00.000Z');
  assert.equal(cards[0].photoId, 'photo-1');
});

test('sync queue remains pending while offline and clears only after confirmed upload', () => {
  const pending = createSyncState({ pending: true });
  assert.equal(shouldAttemptSync(pending, false), false);
  assert.equal(shouldAttemptSync(pending, true), true);
  const synced = markSyncSuccess(pending, 'drive-file-123', new Date('2026-11-07T12:00:00.000Z'));
  assert.equal(synced.pending, false);
  assert.equal(synced.fileId, 'drive-file-123');
});
