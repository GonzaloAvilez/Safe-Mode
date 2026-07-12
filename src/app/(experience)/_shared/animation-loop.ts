// Not a React hook on purpose — each canvas keeps its particle/physics state as plain
// variables closed over inside its own useEffect, not as component-level refs, so a
// real hook couldn't be called from in there without restructuring how every screen
// holds its state. A plain function has no such restriction: it can be called from
// inside a useEffect body and its cleanup composed into the effect's own return.
//
// Handles exactly the mechanical part that was duplicated near-identically across
// Arrive/Observe/Remember: respecting prefers-reduced-motion (draw exactly one frame,
// never loop) and the requestAnimationFrame start/stop/cleanup dance. Each screen's
// own particle physics and drawing stay wherever they already were.
export function startAnimationLoop(callback: (elapsedMs: number) => void): {
  stop: () => void;
  prefersReducedMotion: boolean;
} {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = performance.now();

  if (prefersReducedMotion) {
    callback(0);
    return { stop: () => {}, prefersReducedMotion };
  }

  let rafId: number;
  function frame(now: number) {
    callback(now - start);
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  return { stop: () => cancelAnimationFrame(rafId), prefersReducedMotion };
}
