/** Two specialized roles operating on one shared Card Intelligence engine. */
export const TWIN_ROLES = Object.freeze({
  tsuki: Object.freeze({ name: 'Tsuki', responsibilities: ['identify', 'verify', 'catalog', 'ocr'] }),
  yami: Object.freeze({ name: 'Yami', responsibilities: ['price', 'inventory', 'purchase', 'sale'] })
});

export function routeToTwinRole(task) {
  for (const [role, config] of Object.entries(TWIN_ROLES)) {
    if (config.responsibilities.includes(task)) return role;
  }
  return 'shared';
}

export function createTwinReport({ identification = null, valuation = null } = {}) {
  return {
    tsuki: identification ? { status: identification.status, candidateId: identification.candidate?.id || null } : null,
    yami: valuation ? { status: valuation.status, value: valuation.value ?? null, currency: valuation.currency || 'MXN', confidence: valuation.confidence || 'none' } : null,
    sharedEngine: true
  };
}
