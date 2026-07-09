export const rateLimitAllowedFixture = {
  success: true,
  limit: 10,
  remaining: 9,
  reset: Date.now() + 60_000,
  pending: Promise.resolve(),
};

export const rateLimitBlockedFixture = {
  success: false,
  limit: 10,
  remaining: 0,
  reset: Date.now() + 60_000,
  pending: Promise.resolve(),
};
