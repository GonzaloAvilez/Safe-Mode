"use client";

import { useEffect, useRef } from "react";

// A pale, quiet tone — not gold (Arrive, still just you before seeing anyone else)
// and not the multicolor corpus (Observe, other people's presences). This light is
// neither warmth borrowed from elsewhere nor someone else's color; it reads closer
// to moonlight on water — the visitor's own reflection, not a presence to discover.
const SELF: [number, number, number] = [225, 230, 235];

// Box breathing: 4s in, 4s hold, 4s out, 4s hold. Not an arbitrary animation curve —
// a cadence most people already recognize in the body, the same one Bonnie's beat of
// silence in front of her own reflection stands in for.
const INHALE_MS = 4000;
const HOLD_FULL_MS = 4000;
const EXHALE_MS = 4000;
const HOLD_EMPTY_MS = 4000;
const CYCLE_MS = INHALE_MS + HOLD_FULL_MS + EXHALE_MS + HOLD_EMPTY_MS;

// A touch adds a ripple on top of the breathing curve, it never replaces it — the
// light keeps breathing on its own whether or not anyone touches it, same as the
// rest of the flow never depending on the visitor doing anything to stay present.
// Two boosts instead of one — lub-dub, not a single flash — the second smaller and
// slightly delayed, the way an actual heartbeat reads rather than a UI blip.
const TOUCH_BOOST = 0.55;
const TOUCH_BOOST_SECOND = 0.38;
const HEARTBEAT_GAP_MS = 180;
const TOUCH_DECAY = 0.94; // per frame (~16ms) — settles back to 0 in under a second

const MOUSE_HIT_RADIUS = 60;
const TOUCH_HIT_RADIUS = 100;

// Whichever phrase held the visitor's attention longest in Observe, if it reaches
// here at all. Observe doesn't write this key yet, so reading it degrades to "show
// nothing" rather than erroring — this screen must work standalone regardless.
const ECHO_STORAGE_KEY = "sm:lastResonantPhrase";
const ECHO_VISIBLE_MS = 2600;
const ECHO_FADE_MS = 900;

function easeInOutSine(x: number): number {
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

// 0 at full exhale (resting), 1 at full inhale (peak) — the breathing curve alone,
// no touch boost included.
function breathingScale(elapsedMs: number): number {
  const pos = elapsedMs % CYCLE_MS;
  if (pos < INHALE_MS) {
    return easeInOutSine(pos / INHALE_MS);
  }
  if (pos < INHALE_MS + HOLD_FULL_MS) {
    return 1;
  }
  if (pos < INHALE_MS + HOLD_FULL_MS + EXHALE_MS) {
    const p = (pos - INHALE_MS - HOLD_FULL_MS) / EXHALE_MS;
    return 1 - easeInOutSine(p);
  }
  return 0;
}

export function RememberCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const echoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const echoEl = echoRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let touchBoost = 0;

    function resize() {
      width = canvas!.width = window.innerWidth;
      height = canvas!.height = window.innerHeight;
      centerX = width / 2;
      centerY = height * 0.46;
    }
    resize();

    function handleResize() {
      resize();
    }
    window.addEventListener("resize", handleResize);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function withinHit(x: number, y: number, radius: number) {
      const dx = x - centerX;
      const dy = y - centerY;
      return Math.sqrt(dx * dx + dy * dy) < radius;
    }

    function draw(scale: number) {
      ctx!.clearRect(0, 0, width, height);
      ctx!.fillStyle = "#0a0c10";
      ctx!.fillRect(0, 0, width, height);

      const [r, g, b] = SELF;
      // 0.55..0.9 base range across the breath, plus whatever the touch ripple is
      // still contributing on top — never below "present", only ever brighter.
      const alpha = 0.55 + scale * 0.35 + touchBoost * 0.25;
      const baseR = 5;
      const radius = baseR * (1 + scale * 0.6 + touchBoost * 0.5);

      const outer = ctx!.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 16);
      outer.addColorStop(0, `rgba(${r},${g},${b},${0.16 * alpha})`);
      outer.addColorStop(0.4, `rgba(${r},${g},${b},${0.05 * alpha})`);
      outer.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx!.beginPath();
      ctx!.arc(centerX, centerY, radius * 16, 0, Math.PI * 2);
      ctx!.fillStyle = outer;
      ctx!.fill();

      const mid = ctx!.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 6);
      mid.addColorStop(0, `rgba(${r},${g},${b},${0.45 * alpha})`);
      mid.addColorStop(0.5, `rgba(${r},${g},${b},${0.14 * alpha})`);
      mid.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx!.beginPath();
      ctx!.arc(centerX, centerY, radius * 6, 0, Math.PI * 2);
      ctx!.fillStyle = mid;
      ctx!.fill();

      ctx!.beginPath();
      ctx!.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(${r},${g},${b},${Math.min(1, alpha)})`;
      ctx!.fill();
    }

    function triggerPulse() {
      if (prefersReducedMotion) {
        // No continuous animation loop to fold a ripple into — two boosted frames
        // in sequence are the reduced-motion equivalent of the lub-dub pulse.
        draw(0.85);
        window.setTimeout(() => draw(0.7), HEARTBEAT_GAP_MS);
        window.setTimeout(() => draw(0.5), HEARTBEAT_GAP_MS + 500);
        return;
      }
      touchBoost = Math.min(1, touchBoost + TOUCH_BOOST);
      window.setTimeout(() => {
        touchBoost = Math.min(1, touchBoost + TOUCH_BOOST_SECOND);
      }, HEARTBEAT_GAP_MS);
    }

    function handleClick(e: MouseEvent) {
      if (withinHit(e.clientX, e.clientY, MOUSE_HIT_RADIUS)) triggerPulse();
    }
    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch) return;
      if (withinHit(touch.clientX, touch.clientY, TOUCH_HIT_RADIUS)) triggerPulse();
    }
    window.addEventListener("click", handleClick);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });

    let echoText: string | null = null;
    try {
      echoText = window.sessionStorage.getItem(ECHO_STORAGE_KEY);
    } catch {
      echoText = null;
    }
    if (echoText && echoEl) {
      echoEl.textContent = echoText;
      requestAnimationFrame(() => echoEl.classList.add("visible"));
      window.setTimeout(() => echoEl.classList.remove("visible"), ECHO_VISIBLE_MS);
    }

    const start = performance.now();
    let rafId: number;

    function frame(now: number) {
      const scale = breathingScale(now - start);
      draw(scale);
      touchBoost *= TOUCH_DECAY;
      if (touchBoost < 0.001) touchBoost = 0;
      rafId = requestAnimationFrame(frame);
    }

    if (prefersReducedMotion) {
      draw(0.5);
    } else {
      rafId = requestAnimationFrame(frame);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("touchstart", handleTouchStart);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" />
      <div
        ref={echoRef}
        className="pointer-events-none fixed top-1/2 left-1/2 z-10 max-w-[280px] -translate-x-1/2 translate-y-[70px] text-center text-[11px] tracking-[.4px] text-white/55 opacity-0 transition-opacity ease-out [&.visible]:opacity-100"
        style={{ transitionDuration: `${ECHO_FADE_MS}ms` }}
      />
    </>
  );
}
