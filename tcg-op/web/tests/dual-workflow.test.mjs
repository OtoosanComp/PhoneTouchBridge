import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTechnicalReview,
  approveTechnicalFilter,
  canYamiAccess,
  createMarketListing,
  approveListingPrice,
  canPublishListing,
  sellerCardView,
  registerSale
} from '../src/card-intelligence/dual-workflow.js';

const filters = ['identification', 'classification', 'printing', 'condition'];

function fullyApprovedReview() {
  let review = createTechnicalReview({ copyId: 'COPY-1', printingId: 'PRINT-1' });
  for (const filter of filters) review = approveTechnicalFilter(review, filter, { reviewer: 'owner', evidenceIds: [`${filter}-evidence`] });
  return review;
}

test('Yami remains blocked until all four Tsuki filters are approved', () => {
  let review = createTechnicalReview({ copyId: 'COPY-1', printingId: 'PRINT-1' });
  for (const filter of filters.slice(0, 3)) review = approveTechnicalFilter(review, filter, { reviewer: 'owner', evidenceIds: [`${filter}-evidence`] });
  assert.equal(canYamiAccess(review), false);
  review = approveTechnicalFilter(review, 'condition', { reviewer: 'owner', evidenceIds: ['condition-evidence'] });
  assert.equal(canYamiAccess(review), true);
});

test('a technical filter cannot be approved without evidence and reviewer', () => {
  const review = createTechnicalReview({ copyId: 'COPY-1', printingId: 'PRINT-1' });
  assert.throws(() => approveTechnicalFilter(review, 'identification', { reviewer: '', evidenceIds: [] }), /reviewer and evidence/i);
});

test('unknown or invalid filter names cannot satisfy technical approval', () => {
  const review = createTechnicalReview({ copyId: 'COPY-1', printingId: 'PRINT-1' });
  assert.throws(() => approveTechnicalFilter(review, 'market-price', { reviewer: 'owner', evidenceIds: ['x'] }), /unknown technical filter/i);
});

test('Yami cannot create a market listing before Tsuki approval', () => {
  const review = createTechnicalReview({ copyId: 'COPY-1', printingId: 'PRINT-1' });
  assert.throws(() => createMarketListing({ review, quotes: [] }), /technical approval required/i);
});

test('a listing cannot publish before owner approves its price', () => {
  const review = fullyApprovedReview();
  const listing = createMarketListing({ review, quotes: [] });
  assert.equal(canPublishListing(listing), false);
});

test('seller view exposes only approved commercial fields', () => {
  const review = fullyApprovedReview();
  const listing = approveListingPrice(createMarketListing({ review, quotes: [] }), { approvedPrice: 120, currency: 'MXN', approvedBy: 'owner' });
  const view = sellerCardView({ listing, copy: { copyId: 'COPY-1', name: 'Dark Magician', game: 'YUGIOH', condition: 'LP', technicalNotes: 'private', ownerNotes: 'private' } });
  assert.deepEqual(Object.keys(view).sort(), ['availability', 'copyId', 'currency', 'name', 'price', 'game'].sort());
  assert.equal(view.price, 120);
  assert.equal('technicalNotes' in view, false);
});

test('sale registration is one-way and prevents selling the same copy twice', () => {
  const review = fullyApprovedReview();
  const listing = approveListingPrice(createMarketListing({ review, quotes: [] }), { approvedPrice: 120, currency: 'MXN', approvedBy: 'owner' });
  const sold = registerSale({ listing, copyId: 'COPY-1', transactionId: 'TX-1', sellerId: 'SELLER-1' });
  assert.equal(sold.status, 'SOLD');
  assert.throws(() => registerSale({ listing: sold, copyId: 'COPY-1', transactionId: 'TX-2', sellerId: 'SELLER-1' }), /not available/i);
});

test('printing cannot pass without an exact printing identifier', () => {
  const review = createTechnicalReview({ copyId: 'COPY-1' });
  assert.throws(() => approveTechnicalFilter(review, 'printing', { reviewer: 'owner', evidenceIds: ['photo-1'] }), /verified printingId/i);
});

test('reopening a technical filter revokes Yami eligibility and increments revision', async () => {
  const { reopenTechnicalFilter } = await import('../src/card-intelligence/dual-workflow.js');
  const approved = fullyApprovedReview();
  const reopened = reopenTechnicalFilter(approved, 'condition');
  assert.equal(reopened.status, 'IN_REVIEW');
  assert.equal(reopened.revision, approved.revision + 1);
  assert.equal(canYamiAccess(reopened), false);
});
