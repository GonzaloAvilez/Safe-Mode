// Plain module, no "use client" — every export of a "use client" file becomes a
// client-only reference under Next.js's RSC bundler, so a Server Component can't call
// it directly (throws "Attempted to call randomStartIndex() from the server" in a
// production/preview build, even though local `next dev` didn't enforce it). Living
// here lets the async server component (LivingPhrasesFeed) call it for real.
export function randomStartIndex(length: number): number {
  return length > 0 ? Math.floor(Math.random() * length) : 0;
}
