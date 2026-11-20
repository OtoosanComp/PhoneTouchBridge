/**
 * TCG OP Dual Intelligence workflow contract.
 * Tsuki owns technical approval; Yami owns market/listing data.
 * This module is deliberately storage- and UI-agnostic so the rules can be
 * tested before being wired into the local-first PWA or a future sales API.
 */

export const TECHNICAL_FILTERS = Object.freeze([
  'identification',
  'classification',
  'printing',
  'condition'
]);

const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;

export function createTechnicalReview({ copyId, printingId }) {
  if (!isNonEmptyString(copyId)) throw new TypeError('copyId is required');
  return {
    copyId,
    printingId: isNonEmptyString(printingId) ? printingId : null,
    status: 'IN_REVIEW',
    filters: Object.fromEntries(TECHNICAL_FILTERS.map(name => [name, {
      status: 'PENDING', reviewer: null, evidenceIds: [], approvedAt: null
    }])),
    approvedAt: null,
    revision: 1
  };
}

export function approveTechnicalFilter(review, filter, { reviewer, evidenceIds = [] } = {}) {
  if (!review || !review.filters) throw new TypeError('A technical review is required');
  if (!TECHNICAL_FILTERS.includes(filter)) throw new Error('Unknown technical filter');
  if (!isNonEmptyString(reviewer) || !Array.isArray(evidenceIds) || !evidenceIds.some(isNonEmptyString)) {
    throw new Error('A reviewer and evidence are required');
  }
  if (filter === 'printing' && !isNonEmptyString(review.printingId)) {
    throw new Error('A verified printingId is required before printing approval');
  }
  const filters = {
    ...review.filters,
    [filter]: {
      status: 'APPROVED',
      reviewer: reviewer.trim(),
      evidenceIds: [...new Set(evidenceIds.filter(isNonEmptyString))],
      approvedAt: new Date().toISOString()
    }
  };
  const allApproved = TECHNICAL_FILTERS.every(name => filters[name]?.status === 'APPROVED');
  return {
    ...review,
    filters,
    status: allApproved ? 'TECHNICAL_APPROVED' : 'IN_REVIEW',
    approvedAt: allApproved ? new Date().toISOString() : null
  };
}

/** Reopening any technical gate invalidates the complete approval and listing eligibility. */
export function reopenTechnicalFilter(review, filter) {
  if (!review || !review.filters) throw new TypeError('A technical review is required');
  if (!TECHNICAL_FILTERS.includes(filter)) throw new Error('Unknown technical filter');
  const filters = {
    ...review.filters,
    [filter]: { status: 'PENDING', reviewer: null, evidenceIds: [], approvedAt: null }
  };
  return { ...review, filters, status: 'IN_REVIEW', approvedAt: null, revision: Number(review.revision || 1) + 1 };
}

export function canYamiAccess(review) {
  return Boolean(review && review.status === 'TECHNICAL_APPROVED' &&
    TECHNICAL_FILTERS.every(name => review.filters?.[name]?.status === 'APPROVED'));
}

export function createMarketListing({ review, quotes = [] } = {}) {
  if (!canYamiAccess(review)) throw new Error('Technical approval required before Yami market analysis');
  return {
    listingId: null,
    copyId: review.copyId,
    technicalRevision: review.revision,
    marketStatus: 'ANALYSIS_PENDING',
    quotes: Array.isArray(quotes) ? quotes : [],
    suggestedPrice: null,
    minimumPrice: null,
    approvedPrice: null,
    currency: null,
    approvedBy: null,
    status: 'DRAFT'
  };
}

export function approveListingPrice(listing, { approvedPrice, currency, approvedBy } = {}) {
  if (!listing || listing.status === 'SOLD') throw new Error('Listing is not available for price approval');
  if (!Number.isFinite(approvedPrice) || approvedPrice <= 0) throw new TypeError('A positive approved price is required');
  if (!isNonEmptyString(currency) || !isNonEmptyString(approvedBy)) throw new TypeError('Currency and owner approval are required');
  return {
    ...listing,
    approvedPrice,
    currency: currency.trim().toUpperCase(),
    approvedBy: approvedBy.trim(),
    status: 'PUBLISHED'
  };
}

export function canPublishListing(listing) {
  return Boolean(listing && listing.status === 'PUBLISHED' &&
    Number.isFinite(listing.approvedPrice) && listing.approvedPrice > 0 &&
    isNonEmptyString(listing.currency) && isNonEmptyString(listing.approvedBy));
}

/** Explicit allowlist: never expose technical notes, owner notes, or raw quotes to a seller. */
export function sellerCardView({ listing, copy } = {}) {
  if (!canPublishListing(listing)) throw new Error('Listing is not published');
  if (!copy || copy.copyId !== listing.copyId) throw new Error('Copy does not match listing');
  return {
    copyId: copy.copyId,
    name: String(copy.name || ''),
    game: String(copy.game || ''),
    price: listing.approvedPrice,
    currency: listing.currency,
    availability: 'AVAILABLE'
  };
}

export function registerSale({ listing, copyId, transactionId, sellerId } = {}) {
  if (!canPublishListing(listing) || listing.copyId !== copyId) throw new Error('Listing is not available for sale');
  if (!isNonEmptyString(transactionId) || !isNonEmptyString(sellerId)) throw new TypeError('Transaction and seller identifiers are required');
  return {
    ...listing,
    status: 'SOLD',
    sale: {
      transactionId: transactionId.trim(),
      sellerId: sellerId.trim(),
      soldAt: new Date().toISOString(),
      amount: listing.approvedPrice,
      currency: listing.currency
    }
  };
}
