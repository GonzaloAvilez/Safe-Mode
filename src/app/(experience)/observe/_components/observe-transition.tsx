"use client";

import { useEffect, useRef } from "react";
import { SCENE_BG_HEX } from "../../_shared/scene";
import { startAnimationLoop } from "../../_shared/animation-loop";

// Same gold family as Arrive/Searching/Observe's own CTA accent (200,160,30) — this
// screen isn't introducing a new palette, just continuing the one the flow already has.
const GOLD: [number, number, number] = [210, 158, 32];
const CORE_GLOW: [number, number, number] = [255, 248, 200];

// Scattered points that appear once the star settles, foreshadowing the ecosystem of
// presences Observe is about to reveal — same palette ObserveCanvas draws phrase nodes
// in, so the handoff between this screen and the real canvas doesn't feel like a cut.
const ECOSYSTEM_COLORS: [number, number, number][] = [
  [200, 160, 30],
  [100, 190, 150],
  [150, 130, 210],
  [190, 110, 130],
  [80, 160, 180],
];

const FADE_MS = 500;
const BREATHE_MS = 2000; // two pulses
const TRANSFORM_MS = 700;
const TRAVEL_MS = 900;

const BREATHE_START = FADE_MS;
const TRANSFORM_START = BREATHE_START + BREATHE_MS;
const TRAVEL_START = TRANSFORM_START + TRANSFORM_MS;
// The choreography visitors always sit through in full — after this, the scene holds
// on the arrival frame indefinitely, whether that's a two-second wait or a longer one.
const CHOREOGRAPHY_END_MS = TRAVEL_START + TRAVEL_MS;

const ECOSYSTEM_POINT_COUNT = 14;

type EcosystemPoint = { angle: number; radiusFrac: number; phase: number; colorIndex: number };

function buildEcosystemPoints(): EcosystemPoint[] {
  const points: EcosystemPoint[] = [];
  for (let i = 0; i < ECOSYSTEM_POINT_COUNT; i++) {
    points.push({
      angle: (i / ECOSYSTEM_POINT_COUNT) * Math.PI * 2 + i * 0.4,
      radiusFrac: 0.35 + ((i * 0.53) % 1) * 0.6,
      phase: i * 0.7,
      colorIndex: i % ECOSYSTEM_COLORS.length,
    });
  }
  return points;
}

function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}

// Full-screen ritual shown while /observe's data loads in the background — always plays
// to completion (onComplete fires once, at CHOREOGRAPHY_END_MS) regardless of how long
// the fetch takes, then holds on this arrival frame in an idle loop. The parent decides
// what replaces it once both the animation and the fetch are ready — see observe-screen.tsx.
export function ObserveTransition({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let settledY = 0;
    const ecosystemPoints = buildEcosystemPoints();
    let completed = false;

    function resize() {
      width = canvas!.width = window.innerWidth;
      height = canvas!.height = window.innerHeight;
      centerX = width / 2;
      centerY = height * 0.46;
      settledY = height * 0.4;
    }
    resize();
    window.addEventListener("resize", resize);

    function drawGlowDot(x: number, y: number, radius: number, alpha: number, color: [number, number, number]) {
      const [r, g, b] = color;
      const halo = ctx!.createRadialGradient(x, y, 0, x, y, radius);
      halo.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx!.beginPath();
      ctx!.arc(x, y, radius, 0, Math.PI * 2);
      ctx!.fillStyle = halo;
      ctx!.fill();
    }

    function drawSphere(x: number, y: number, radius: number, alpha: number) {
      drawGlowDot(x, y, radius * 2.2, 0.4 * alpha, GOLD);
      ctx!.beginPath();
      ctx!.arc(x, y, radius, 0, Math.PI * 2);
      const body = ctx!.createRadialGradient(x, y, 0, x, y, radius);
      body.addColorStop(0, `rgba(${CORE_GLOW[0]},${CORE_GLOW[1]},${CORE_GLOW[2]},${alpha})`);
      body.addColorStop(1, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${0.5 * alpha})`);
      ctx!.fillStyle = body;
      ctx!.fill();
    }

    function drawStar(x: number, y: number, size: number, alpha: number, spin: number) {
      ctx!.save();
      ctx!.translate(x, y);
      ctx!.rotate(spin);
      ctx!.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const outerX = Math.cos(a) * size;
        const outerY = Math.sin(a) * size;
        const midA = a + Math.PI / 4;
        const innerX = Math.cos(midA) * size * 0.28;
        const innerY = Math.sin(midA) * size * 0.28;
        if (i === 0) ctx!.moveTo(outerX, outerY);
        else ctx!.lineTo(outerX, outerY);
        ctx!.lineTo(innerX, innerY);
      }
      ctx!.closePath();
      ctx!.fillStyle = `rgba(${CORE_GLOW[0]},${CORE_GLOW[1]},${CORE_GLOW[2]},${alpha})`;
      ctx!.fill();
      ctx!.restore();
      drawGlowDot(x, y, size * 3, 0.5 * alpha, GOLD);
    }

    function drawFrame(elapsedMs: number) {
      ctx!.clearRect(0, 0, width, height);
      ctx!.fillStyle = SCENE_BG_HEX;
      ctx!.fillRect(0, 0, width, height);
      const t = elapsedMs * 0.001;

      if (elapsedMs < FADE_MS) {
        const alpha = easeOutCubic(elapsedMs / FADE_MS);
        drawSphere(centerX, centerY, 14, alpha * 0.6);
      } else if (elapsedMs < TRANSFORM_START) {
        const breatheT = (elapsedMs - BREATHE_START) / 1000;
        const pulse = 0.5 + 0.5 * Math.sin(breatheT * Math.PI - Math.PI / 2);
        const radius = 18 + pulse * 16;
        drawSphere(centerX, centerY, radius, 1);
      } else if (elapsedMs < TRAVEL_START) {
        const p = easeOutCubic((elapsedMs - TRANSFORM_START) / TRANSFORM_MS);
        const radius = 34 * (1 - p) + 2;
        if (p < 1) drawSphere(centerX, centerY, radius, 1 - p);
        drawStar(centerX, centerY, 6 + p * 10, p, p * Math.PI);
      } else if (elapsedMs < CHOREOGRAPHY_END_MS) {
        const p = easeOutCubic((elapsedMs - TRAVEL_START) / TRAVEL_MS);
        const x = centerX + p * width * 0.22;
        const y = centerY + p * (settledY - centerY);
        // Trail of fading dots behind the traveling star.
        for (let i = 1; i <= 5; i++) {
          const trailP = Math.max(0, p - i * 0.05);
          const tx = centerX + trailP * width * 0.22;
          const ty = centerY + trailP * (settledY - centerY);
          drawGlowDot(tx, ty, 5, (1 - i / 5) * 0.25, GOLD);
        }
        drawStar(x, y, 12 - p * 4, 1, p * Math.PI * 1.5);
      } else {
        // Arrival hold — loops indefinitely until the parent swaps this component out
        // once both the ritual and the real data are ready.
        const settledX = centerX + width * 0.22;
        const twinkle = 0.75 + Math.sin(t * 1.6) * 0.25;
        drawStar(settledX, settledY, 8 * twinkle, 1, Math.sin(t * 0.3) * 0.4);

        const sinceArrival = elapsedMs - CHOREOGRAPHY_END_MS;
        ecosystemPoints.forEach((pt, i) => {
          // Points appear one at a time over the first ~2.5s of the hold, then just
          // drift and twinkle in place for as long as the hold lasts.
          const appearAt = i * 160;
          if (sinceArrival < appearAt) return;
          const appearP = easeOutCubic(Math.min(1, (sinceArrival - appearAt) / 400));
          const angle = pt.angle + t * 0.04;
          const radiusPx = 40 + pt.radiusFrac * Math.min(width, height) * 0.32;
          const x = settledX + Math.cos(angle) * radiusPx * 0.5;
          const y = settledY + Math.sin(angle) * radiusPx * 0.32;
          const alpha = appearP * (0.4 + Math.sin(t * 0.8 + pt.phase) * 0.25);
          drawGlowDot(x, y, 3.5, Math.max(0, alpha), ECOSYSTEM_COLORS[pt.colorIndex]);
        });

        if (!completed) {
          completed = true;
          onComplete();
        }
      }
    }

    const { stop, prefersReducedMotion } = startAnimationLoop(drawFrame);

    // Nothing to sit through when motion is reduced — hold on the arrival frame right
    // away and signal completion immediately rather than skipping the ritual mid-beat.
    if (prefersReducedMotion) {
      drawFrame(CHOREOGRAPHY_END_MS);
    }

    return () => {
      window.removeEventListener("resize", resize);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-30" role="status" aria-live="polite">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
        <div className="flex translate-y-[16vh] flex-col gap-2">
          <span className="text-[11px] tracking-[1.5px] text-white/35">
            {"un instante para encontrarnos"}
          </span>
          <span className="text-[11px] tracking-[2px] text-white/20">· · ·</span>
        </div>
      </div>
    </div>
  );
}
