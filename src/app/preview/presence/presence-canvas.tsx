"use client";

import { useEffect, useRef } from "react";

type Phrase = {
  id: string;
  text: string;
};

const COLORS: [number, number, number][] = [
  [200, 160, 30],
  [180, 145, 25],
  [100, 190, 150],
  [150, 130, 210],
  [210, 210, 220],
  [190, 110, 130],
  [80, 160, 180],
];

const CONN_DIST = 120;
const COLLISION_DIST = 42;
const COLLISION_STRENGTH = 0.06;
const TOOLTIP_MAX_LENGTH = 60;

// A held-hover pause before the phrase reveals itself — "la transformación necesita reposar":
// text landing instantly reads as a UI tooltip, text that waits a beat reads as a moment.
const TOOLTIP_REVEAL_DELAY_MS = 450;

// A cursor is precise; a fingertip isn't. Touch needs a much larger hit radius than
// mouse hover or almost every tap misses the small dots entirely.
const MOUSE_HOVER_RADIUS = 14;
const TOUCH_HOVER_RADIUS = 28;

// The lead line frames someone else's act, never the viewer's state — it must hold up
// whether the visitor arrives sleepy, mid-focus, already relaxed, or restless, so it
// stays short, concrete, and free of any claim about how the viewer feels right now.
// One is picked per session (not per hover) so a single visit reads as consistent.
const LEAD_PHRASES = [
  "alguien decidió no esconder esto",
  "esto existía antes de que llegaras",
  "alguien lo dejó, tal como es",
  "alguien decidió compartirlo y soltarlo",
  "alguien decidió compartir esto tal como es",
];

// Global repulsion (all pairs, falls off with distance) keeps distinct clusters apart —
// without it, attraction alone collapses the whole corpus toward one blob, since enough
// pairs clear the similarity threshold that the graph behaves like a small world.
const REPEL_SCALE = 0.6;

// Below this cosine similarity, phrases get no pull toward each other at all — real
// embeddings of short phrases in the same language share some baseline similarity
// (median across the seed corpus is ~0.38) that isn't genuine emotional closeness.
const ATTRACTION_THRESHOLD = 0.5;
const ATTRACTION_STRENGTH = 0.00003;
const ATTRACTION_MAX_DIST = 260; // cap so far-flung similar pairs don't overshoot on the pull in

// A minority of points occasionally flare up like the central node, then recede —
// unsynchronized, so it reads as presences quietly surfacing one at a time, not a strobe.
const FLASH_CHANCE = 0.15;

// Fixed UI chrome (the enter button, the corner caption) sits over the canvas at all
// viewport sizes, but on narrow/mobile widths it covers proportionally more of the
// screen — without a keep-out halo, drifting points collide with it visually.
const UI_EXCLUSION_MARGIN = 60;
const UI_EXCLUSION_STRENGTH = 0.4;

type Rect = { left: number; top: number; right: number; bottom: number };

function repelFromZone(p: Point, zone: Rect, margin: number, strength: number) {
  const closestX = Math.max(zone.left, Math.min(p.x, zone.right));
  const closestY = Math.max(zone.top, Math.min(p.y, zone.bottom));
  const dx = p.x - closestX;
  const dy = p.y - closestY;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= margin) return;

  if (d === 0) {
    // Sitting exactly inside the zone (e.g. right after a resize) — no direction to
    // push away from, so nudge upward rather than leaving velocity untouched.
    p.vy -= strength;
    return;
  }
  const force = (1 - d / margin) * strength;
  p.vx += (dx / d) * force;
  p.vy += (dy / d) * force;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

class Point {
  x: number;
  y: number;
  r: number;
  color: [number, number, number];
  isCentral: boolean;
  phraseText: string | null;
  phraseIndex: number | null;
  vx: number;
  vy: number;
  phase: number;
  brightness: number;
  hovered: boolean;
  flashSpeed: number;
  flashPhase: number;

  constructor(
    x: number,
    y: number,
    r: number,
    color: [number, number, number],
    isCentral: boolean,
    phraseText: string | null = null,
    phraseIndex: number | null = null
  ) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.color = color;
    this.isCentral = isCentral;
    this.phraseText = phraseText;
    this.phraseIndex = phraseIndex;
    this.vx = isCentral ? 0 : (Math.random() - 0.5) * 0.35;
    this.vy = isCentral ? 0 : (Math.random() - 0.5) * 0.35;
    this.phase = Math.random() * Math.PI * 2;
    this.brightness = 0.35 + Math.random() * 0.5;
    this.hovered = false;
    this.flashSpeed = !isCentral && Math.random() < FLASH_CHANCE ? 0.4 + Math.random() * 0.5 : 0;
    this.flashPhase = Math.random() * Math.PI * 2;
  }

  update(width: number, height: number, mouse: { x: number; y: number }) {
    if (this.isCentral) return;

    // `hovered` is set from the outside (by whichever point matches the current
    // hoverTarget) rather than computed here — mouse and touch share that one
    // source of truth instead of each running their own distance check.
    if (this.hovered) {
      // Frozen while its phrase is being read — otherwise it drifts out from under
      // the cursor and the tooltip flickers away mid-sentence.
      this.vx *= 0.9;
      this.vy *= 0.9;
      return;
    }

    const dx = mouse.x - this.x;
    const dy = mouse.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 120 && dist > 0) {
      this.vx += (dx / dist) * 0.008;
      this.vy += (dy / dist) * 0.008;
    }

    this.vx *= 0.98;
    this.vy *= 0.98;
    this.x += this.vx;
    this.y += this.vy;

    if (this.x < 15) this.vx += 0.1;
    if (this.x > width - 15) this.vx -= 0.1;
    if (this.y < 15) this.vy += 0.1;
    if (this.y > height - 15) this.vy -= 0.1;
  }

  draw(ctx: CanvasRenderingContext2D, t: number) {
    let pulse = this.isCentral
      ? 0.75 + Math.sin(t * 1.1) * 0.25
      : 0.55 + Math.sin(t * 0.7 + this.phase) * 0.3;

    // Brief flare toward the central node's presence, then back to normal — the ^6
    // keeps the flash mostly quiet with only occasional, brief peaks, never a strobe.
    const flash =
      this.flashSpeed > 0 ? Math.max(0, Math.sin(t * this.flashSpeed + this.flashPhase)) ** 6 : 0;
    pulse += flash * 0.5;

    const [r, g, b] = this.color;
    const alpha = this.brightness * pulse * (this.hovered ? 1.4 : 1);
    const radius =
      this.r * (this.isCentral ? 1 + Math.sin(t * 1.1) * 0.15 : 1) * (1 + flash * 0.35);

    const haloR = radius * (this.hovered ? 7 : 5 + flash * 3);
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, haloR);
    grad.addColorStop(0, `rgba(${r},${g},${b},${Math.min(1, alpha * 0.7)})`);
    grad.addColorStop(0.35, `rgba(${r},${g},${b},${alpha * 0.12})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.beginPath();
    ctx.arc(this.x, this.y, haloR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, alpha * 1.8)})`;
    ctx.fill();
  }
}

export function PresenceCanvas({
  phrases,
  similarities,
}: {
  phrases: Phrase[];
  similarities: number[][];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipLeadRef = useRef<HTMLDivElement>(null);
  const tooltipTextRef = useRef<HTMLDivElement>(null);
  const buttonZoneRef = useRef<HTMLDivElement>(null);
  const captionZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const tooltip = tooltipRef.current;
    const tooltipLead = tooltipLeadRef.current;
    const tooltipText = tooltipTextRef.current;
    const buttonZoneEl = buttonZoneRef.current;
    const captionZoneEl = captionZoneRef.current;
    if (!canvas || !tooltip || !tooltipLead || !tooltipText || !buttonZoneEl || !captionZoneEl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let points: Point[] = [];
    const mouse = { x: -999, y: -999 };
    let buttonZone: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
    let captionZone: Rect = { left: 0, top: 0, right: 0, bottom: 0 };

    function measureUiZones() {
      const b = buttonZoneEl!.getBoundingClientRect();
      const c = captionZoneEl!.getBoundingClientRect();
      buttonZone = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      captionZone = { left: c.left, top: c.top, right: c.right, bottom: c.bottom };
    }

    function resize() {
      width = canvas!.width = window.innerWidth;
      height = canvas!.height = window.innerHeight;
      centerX = width / 2;
      centerY = height / 2;
      measureUiZones();
    }

    function initPoints() {
      points = [];
      points.push(new Point(centerX, centerY, 9, [200, 160, 30], true));

      phrases.forEach((phrase, i) => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 70 + Math.random() * Math.min(width, height) * 0.42;
        const x = Math.max(15, Math.min(width - 15, centerX + Math.cos(angle) * dist));
        const y = Math.max(15, Math.min(height - 15, centerY + Math.sin(angle) * dist));
        const color = COLORS[i % COLORS.length];
        const p = new Point(x, y, 2 + Math.random() * 2.5, color, false, phrase.text, i);
        p.brightness = 0.35 + Math.random() * 0.45;
        points.push(p);
      });
    }

    resize();
    initPoints();

    function handleResize() {
      resize();
      initPoints();
    }

    // One lead phrase for the whole session, not re-rolled per hover — otherwise the
    // same visit would show a different framing line on every point, which reads as
    // random UI copy rather than a single consistent presence.
    const leadPhrase = LEAD_PHRASES[Math.floor(Math.random() * LEAD_PHRASES.length)];

    // Which point is currently held under the cursor, and the pending timer that will
    // reveal its phrase — tracked outside handleMouseMove so a reveal in flight can be
    // cancelled the instant the cursor moves off before the pause finishes.
    let hoverTarget: Point | null = null;
    let revealTimer: ReturnType<typeof setTimeout> | null = null;

    // Updated once the real phrase text is measured, so positioning can clamp against
    // the tooltip's actual footprint instead of guessing — a two-word phrase and a
    // six-line one need different amounts of edge margin.
    let tooltipSize = { width: 240, height: 60 };

    function positionTooltip(clientX: number, clientY: number) {
      const margin = 16;
      const maxLeft = window.innerWidth - tooltipSize.width - margin;
      const maxTop = window.innerHeight - tooltipSize.height - margin;
      const left = Math.min(clientX + 14, Math.max(margin, maxLeft));
      const top = Math.max(margin, Math.min(clientY - 20, Math.max(margin, maxTop)));
      tooltip!.style.left = `${left}px`;
      tooltip!.style.top = `${top}px`;
    }

    // Single source of truth for "which point is under the pointer right now" — used
    // by both mouse (continuous, small radius) and touch (discrete tap, larger radius)
    // instead of each input type running its own hit-test.
    function findHoveredPoint(x: number, y: number, radius: number): Point | null {
      return (
        points.find((p) => {
          if (p.isCentral || !p.phraseText) return false;
          const dx = p.x - x;
          const dy = p.y - y;
          return Math.sqrt(dx * dx + dy * dy) < radius;
        }) ?? null
      );
    }

    function setHoverTarget(hovered: Point | null, clientX: number, clientY: number) {
      if (hovered === hoverTarget) {
        if (hoverTarget) positionTooltip(clientX, clientY);
        return;
      }

      hoverTarget = hovered;
      if (revealTimer) clearTimeout(revealTimer);
      tooltip!.classList.remove("visible");

      if (hovered) {
        const phraseText = hovered.phraseText!;
        revealTimer = setTimeout(() => {
          tooltipLead!.textContent = leadPhrase;
          tooltipText!.textContent = truncate(phraseText, TOOLTIP_MAX_LENGTH);
          tooltipSize = {
            width: tooltip!.offsetWidth,
            height: tooltip!.offsetHeight,
          };
          positionTooltip(clientX, clientY);
          tooltip!.classList.add("visible");
        }, TOOLTIP_REVEAL_DELAY_MS);
      }
    }

    // Once a real touch happens, stop reacting to mousemove — mobile browsers fire a
    // single synthetic mousemove/click after touchend, and letting both handlers run
    // double-processes the same tap with two different (and conflicting) hit radii.
    let isTouchMode = false;

    function handleMouseMove(e: MouseEvent) {
      if (isTouchMode) return;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      const hovered = findHoveredPoint(e.clientX, e.clientY, MOUSE_HOVER_RADIUS);
      setHoverTarget(hovered, e.clientX, e.clientY);
    }

    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch) return;
      isTouchMode = true;

      if (hoverTarget) {
        // A tap while something is open only dismisses it — it must never also open
        // whatever neighboring dot the same tap happened to land near, or closing one
        // reads as "randomly opened another" (exactly the mobile bug being fixed).
        mouse.x = -999;
        mouse.y = -999;
        setHoverTarget(null, touch.clientX, touch.clientY);
        return;
      }

      mouse.x = touch.clientX;
      mouse.y = touch.clientY;
      const hovered = findHoveredPoint(touch.clientX, touch.clientY, TOUCH_HOVER_RADIUS);
      setHoverTarget(hovered, touch.clientX, touch.clientY);
    }

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let t = 0;
    let rafId: number;

    function frame() {
      ctx!.clearRect(0, 0, width, height);
      ctx!.fillStyle = "#080c14";
      ctx!.fillRect(0, 0, width, height);
      t += 0.012;

      // Push apart any pair that's drifted too close, so points never fully overlap
      // (the cursor-attraction in update() would otherwise pile several onto one spot),
      // and pull emotionally-similar phrases toward each other regardless of distance —
      // the corpus settles into clusters by meaning rather than by chance placement.
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i];
          const b = points[j];
          if (a.isCentral || b.isCentral) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d === 0) continue;
          const nx = dx / d;
          const ny = dy / d;

          // Global repulsion: every pair, always on, stronger at close range. This is what
          // keeps separate clusters apart — a short-range-only repel lets attraction pull
          // every cluster toward the whole corpus's center of mass.
          const repelForce = REPEL_SCALE / (d * d);
          a.vx += nx * repelForce;
          a.vy += ny * repelForce;
          b.vx -= nx * repelForce;
          b.vy -= ny * repelForce;

          // Hard collision floor: once truly touching, an extra short-range push guarantees
          // no two dots ever fully overlap regardless of what else is pulling on them.
          if (d < COLLISION_DIST) {
            const force = (1 - d / COLLISION_DIST) * COLLISION_STRENGTH;
            a.vx += nx * force;
            a.vy += ny * force;
            b.vx -= nx * force;
            b.vy -= ny * force;
          }

          if (a.phraseIndex !== null && b.phraseIndex !== null) {
            const sim = similarities[a.phraseIndex][b.phraseIndex];
            if (sim > ATTRACTION_THRESHOLD) {
              const force = (sim - ATTRACTION_THRESHOLD) * ATTRACTION_STRENGTH * Math.min(d, ATTRACTION_MAX_DIST);
              a.vx -= nx * force;
              a.vy -= ny * force;
              b.vx += nx * force;
              b.vy += ny * force;
            }
          }
        }
      }

      points.forEach((p) => {
        if (p.isCentral) return;
        repelFromZone(p, buttonZone, UI_EXCLUSION_MARGIN, UI_EXCLUSION_STRENGTH);
        repelFromZone(p, captionZone, UI_EXCLUSION_MARGIN, UI_EXCLUSION_STRENGTH);
      });

      points.forEach((p) => {
        p.hovered = p === hoverTarget;
      });
      points.forEach((p) => p.update(width, height, mouse));

      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i];
          const b = points[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < CONN_DIST) {
            const alpha = (1 - d / CONN_DIST) * 0.18;
            const [r, g, bv] = a.color;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.strokeStyle = `rgba(${r},${g},${bv},${alpha})`;
            ctx!.lineWidth = 0.5;
            ctx!.stroke();
          }
        }
      }

      points.forEach((p) => p.draw(ctx!, t));

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(frame);
      }
    }
    frame();

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchstart", handleTouchStart);
      if (rafId) cancelAnimationFrame(rafId);
      if (revealTimer) clearTimeout(revealTimer);
    };
  }, [phrases, similarities]);

  return (
    <>
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" />

      <div className="fixed top-10 left-12 z-10">
        <div className="text-[22px] font-light tracking-[5px] text-white/82">Refugio[Safe Mode]</div>
        <div className="mt-1 text-[11px] tracking-[2.5px] text-white/25">
          Ecosistema de presencias
        </div>
      </div>

      <div
        ref={captionZoneRef}
        className="fixed top-24 left-12 z-10 max-w-[220px] text-[13px] leading-[1.8] tracking-[.3px] text-white/22 sm:top-auto sm:bottom-12"
      >
        Cada luz que ves
        <br />
        es alguien que se atrevió
        <br />a mostrarse por un instante.
      </div>

      <div
        ref={buttonZoneRef}
        className="fixed bottom-12 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2.5"
      >

        <div className="group flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-transparent transition-all duration-400 hover:scale-110 hover:border-[rgba(200,160,30,0.7)]">
          <div className="h-2.5 w-2.5 rounded-full bg-[rgba(200,160,30,0.55)] transition-colors group-hover:bg-[rgba(200,160,30,0.9)]" />
        </div>
        <div className="text-[10px] tracking-[1.5px] text-white/22">entra sin hacer nada</div>
      </div>

      <div
        ref={tooltipRef}
        className="pointer-events-none fixed max-w-[240px] text-center opacity-0 transition-opacity duration-700 [&.visible]:opacity-100"
      >
        <div ref={tooltipLeadRef} className="text-[9px] tracking-[1.5px] text-white/35 uppercase" />
        <div ref={tooltipTextRef} className="mt-1 text-[10px] tracking-[.5px] text-white/60" />
      </div>
    </>
  );
}
