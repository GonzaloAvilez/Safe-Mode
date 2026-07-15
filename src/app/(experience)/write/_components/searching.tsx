"use client";

import { useEffect, useRef } from "react";
import { SCENE_BG_HEX } from "../../_shared/scene";
import { startAnimationLoop } from "../../_shared/animation-loop";

// Same gold as Arrive — Searching is a continuation of the visitor's own presence
// mid-transit, not a new palette. The mockup's note: "la latencia técnica se vuelve
// ritual" — the wait for POST /api/entries to resolve, made to feel intentional.
const GOLD: [number, number, number] = [210, 158, 32];
const CORE_GLOW: [number, number, number] = [255, 248, 200];

const PARTICLE_COUNT = 20;
const RING_COUNT = 4;
const RING_CYCLE_MS = 2600;
const RING_MIN_RADIUS = 15;
const RING_MAX_RADIUS = 190;

type Particle = { angle: number; radiusFrac: number; phase: number };

function buildParticles(): Particle[] {
  // Deterministic spread (not Math.random()) so the reduced-motion single frame is
  // an intentional composition, not visible noise, and the shape is stable across
  // remounts.
  const particles: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      angle: (i / PARTICLE_COUNT) * Math.PI * 2,
      radiusFrac: 0.3 + ((i * 0.37) % 1) * 0.65,
      phase: i * 0.6,
    });
  }
  return particles;
}

// Full-screen ritualized loading state shown while the real entry submission is in
// flight — not a route, mounted directly by EntryForm in place of the form.
export function Searching() {
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
    const particles = buildParticles();

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

    function drawRings(elapsedMs: number) {
      for (let i = 0; i < RING_COUNT; i++) {
        const phase = (elapsedMs / RING_CYCLE_MS + i / RING_COUNT) % 1;
        const radius = RING_MIN_RADIUS + phase * (RING_MAX_RADIUS - RING_MIN_RADIUS);
        const alpha = (1 - phase) * 0.2;
        ctx!.beginPath();
        ctx!.ellipse(centerX, centerY, radius, radius * 0.85, 0, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${alpha})`;
        ctx!.lineWidth = 0.8;
        ctx!.stroke();
      }
    }

    function drawParticles(t: number) {
      const [r, g, b] = GOLD;
      particles.forEach((p) => {
        // Slow orbital drift plus a per-particle brightness pulse — the "esencia
        // viajando" read the mockup's static frame only implies.
        const angle = p.angle + t * 0.06;
        const radiusPx = 20 + p.radiusFrac * 95;
        const x = centerX + Math.cos(angle) * radiusPx;
        const y = centerY + Math.sin(angle) * radiusPx * 0.85;
        const alpha = Math.max(
          0,
          (0.55 - p.radiusFrac * 0.35) * (0.6 + Math.sin(t * 0.8 + p.phase) * 0.4)
        );

        ctx!.beginPath();
        ctx!.moveTo(centerX, centerY);
        ctx!.lineTo(x, y);
        ctx!.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.25})`;
        ctx!.lineWidth = 0.25;
        ctx!.stroke();

        const halo = ctx!.createRadialGradient(x, y, 0, x, y, 4.5);
        halo.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx!.beginPath();
        ctx!.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx!.fillStyle = halo;
        ctx!.fill();

        ctx!.beginPath();
        ctx!.arc(x, y, 0.9, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${r},${g},${b},${Math.min(1, alpha * 1.6)})`;
        ctx!.fill();
      });
    }

    function drawCore(t: number) {
      const pulse = 0.75 + Math.sin(t * 1.4) * 0.25;

      const outer = ctx!.createRadialGradient(centerX, centerY, 0, centerX, centerY, 50);
      outer.addColorStop(0, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${0.4 * pulse})`);
      outer.addColorStop(1, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},0)`);
      ctx!.beginPath();
      ctx!.arc(centerX, centerY, 50, 0, Math.PI * 2);
      ctx!.fillStyle = outer;
      ctx!.fill();

      ctx!.beginPath();
      ctx!.arc(centerX, centerY, 5.5 * (1 + Math.sin(t * 1.4) * 0.15), 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(${CORE_GLOW[0]},${CORE_GLOW[1]},${CORE_GLOW[2]},${0.9 * pulse})`;
      ctx!.fill();
    }

    function drawFrame(elapsedMs: number) {
      ctx!.clearRect(0, 0, width, height);
      ctx!.fillStyle = SCENE_BG_HEX;
      ctx!.fillRect(0, 0, width, height);
      const t = elapsedMs * 0.001;
      drawRings(elapsedMs);
      drawParticles(t);
      drawCore(t);
    }
    const { stop } = startAnimationLoop(drawFrame);

    return () => {
      window.removeEventListener("resize", handleResize);
      stop();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-30" role="status" aria-live="polite">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
        <div className="flex translate-y-[16vh] flex-col gap-2">
          <span className="text-[11px] tracking-[1.5px] text-white/35">your essence is traveling</span>
          <span className="text-[11px] tracking-[2px] text-white/20">· · ·</span>
        </div>
      </div>
    </div>
  );
}
