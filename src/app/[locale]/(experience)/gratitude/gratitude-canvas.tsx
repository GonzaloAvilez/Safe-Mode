"use client";

import { useEffect, useRef } from "react";
import { SCENE_BG_HEX } from "../_shared/scene";
import { startAnimationLoop } from "../_shared/animation-loop";
import { startDrone, stopDrone, startAmbientNotes, stopAmbientNotes } from "../_shared/handpan-audio";

// The full multicolor range, same family as Observe's corpus — by Gratitude the
// visitor's own presence has joined it, so the field reads as "everyone", not just
// "the visitor" (Arrive's gold-only) or "one specific other" (Mirror's violet).
const COLORS: [number, number, number][] = [
  [210, 158, 32],
  [210, 158, 32],
  [100, 190, 150],
  [150, 130, 210],
  [210, 210, 220],
  [80, 160, 180],
];

const CONN_DIST = 90;
const CENTRAL_CONN_DIST = 220;

type Kind = "central" | "orbit" | "dust";

class Particle {
  x: number;
  y: number;
  r: number;
  color: [number, number, number];
  kind: Kind;
  phase: number;
  orbitR = 0;
  orbitSpeed = 0;
  orbitAngle = 0;
  originX: number;
  originY: number;
  vx: number;
  vy: number;

  constructor(x: number, y: number, r: number, color: [number, number, number], kind: Kind) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.color = color;
    this.kind = kind;
    this.phase = Math.random() * Math.PI * 2;
    this.originX = x;
    this.originY = y;
    this.vx = kind === "dust" ? (Math.random() - 0.5) * 0.16 : 0;
    this.vy = kind === "dust" ? (Math.random() - 0.5) * 0.16 : 0;
  }

  update(width: number, height: number, t: number) {
    if (this.kind === "orbit") {
      this.x = this.originX + Math.cos(t * this.orbitSpeed + this.orbitAngle) * this.orbitR;
      this.y = this.originY + Math.sin(t * this.orbitSpeed + this.orbitAngle) * this.orbitR * 0.4;
    }
    if (this.kind === "dust") {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < 8 || this.x > width - 8) this.vx *= -1;
      if (this.y < 8 || this.y > height - 8) this.vy *= -1;
    }
  }

  draw(ctx: CanvasRenderingContext2D, t: number) {
    const [r, g, b] = this.color;

    if (this.kind === "central") {
      const pulse = 0.78 + Math.sin(t * 0.9) * 0.22;

      const ambient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 30);
      ambient.addColorStop(0, `rgba(${r},${g},${b},${0.14 * pulse})`);
      ambient.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 30, 0, Math.PI * 2);
      ctx.fillStyle = ambient;
      ctx.fill();

      const mid = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 8);
      mid.addColorStop(0, `rgba(255,242,185,${0.55 * pulse})`);
      mid.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 8, 0, Math.PI * 2);
      ctx.fillStyle = mid;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * (1 + Math.sin(t * 0.9) * 0.12), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,248,200,${0.95 * pulse})`;
      ctx.fill();
      return;
    }

    const pulse = 0.5 + Math.sin(t * 0.7 + this.phase) * 0.28;
    const brightness = this.kind === "orbit" ? 0.55 : 0.25 + Math.random() * 0.1;
    const halo = this.r * 4.5;

    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, halo);
    grad.addColorStop(0, `rgba(${r},${g},${b},${brightness * pulse})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.beginPath();
    ctx.arc(this.x, this.y, halo, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, brightness * pulse * 1.8)})`;
    ctx.fill();
  }
}

export function GratitudeCanvas() {
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
    let particles: Particle[] = [];

    function resize() {
      width = canvas!.width = window.innerWidth;
      height = canvas!.height = window.innerHeight;
      centerX = width / 2;
      centerY = height * 0.4;
    }

    function buildParticles() {
      particles = [new Particle(centerX, centerY, 6, [210, 158, 32], "central")];

      // Denser and wider than Arrive's — this ecosystem has grown, the visitor's
      // own trace is now woven into it rather than standing apart from it.
      const orbits = [
        { r: 50, count: 8, speed: 0.16 },
        { r: 90, count: 12, speed: 0.1 },
        { r: 135, count: 16, speed: 0.06 },
        { r: 180, count: 16, speed: 0.04 },
        { r: 225, count: 12, speed: 0.025 },
      ];
      orbits.forEach(({ r, count, speed }) => {
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const p = new Particle(
            centerX,
            centerY,
            0.8 + Math.random() * 1.8,
            COLORS[Math.floor(Math.random() * COLORS.length)],
            "orbit"
          );
          p.orbitR = r + (Math.random() - 0.5) * 16;
          p.orbitSpeed = speed * (Math.random() > 0.5 ? 1 : -1);
          p.orbitAngle = angle;
          particles.push(p);
        }
      });

      const dustCount = Math.floor((width * height) / 16000);
      for (let i = 0; i < dustCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.min(width, height) * (0.3 + Math.random() * 0.4);
        const x = Math.max(8, Math.min(width - 8, centerX + Math.cos(angle) * dist));
        const y = Math.max(8, Math.min(height - 8, centerY + Math.sin(angle) * dist));
        particles.push(
          new Particle(x, y, 0.5 + Math.random() * 1.2, COLORS[Math.floor(Math.random() * COLORS.length)], "dust")
        );
      }
    }

    resize();
    buildParticles();

    function handleResize() {
      resize();
      buildParticles();
    }
    window.addEventListener("resize", handleResize);

    function drawConnections() {
      const orbitParticles = particles.filter((p) => p.kind === "orbit");
      const central = particles[0];
      for (let i = 0; i < orbitParticles.length; i++) {
        for (let j = i + 1; j < orbitParticles.length; j++) {
          const a = orbitParticles[i];
          const b = orbitParticles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < CONN_DIST) {
            const alpha = (1 - d / CONN_DIST) * 0.2;
            const [r, g, bv] = a.color;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.strokeStyle = `rgba(${r},${g},${bv},${alpha})`;
            ctx!.lineWidth = 0.4;
            ctx!.stroke();
          }
        }
        const dx = orbitParticles[i].x - central.x;
        const dy = orbitParticles[i].y - central.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < CENTRAL_CONN_DIST) {
          const alpha = (1 - d / CENTRAL_CONN_DIST) * 0.1;
          ctx!.beginPath();
          ctx!.moveTo(orbitParticles[i].x, orbitParticles[i].y);
          ctx!.lineTo(central.x, central.y);
          ctx!.strokeStyle = `rgba(210,160,32,${alpha})`;
          ctx!.lineWidth = 0.3;
          ctx!.stroke();
        }
      }
    }

    let t = 0;
    function drawFrame() {
      ctx!.clearRect(0, 0, width, height);
      ctx!.fillStyle = SCENE_BG_HEX;
      ctx!.fillRect(0, 0, width, height);
      t += 0.01;
      particles.forEach((p) => p.update(width, height, t));
      drawConnections();
      particles.forEach((p) => p.draw(ctx!, t));
    }
    const { stop } = startAnimationLoop(drawFrame);

    // No-ops silently if sound is off — see handpan-audio.ts. Known v1 gap: if sound
    // gets turned on while already sitting on this screen, the drone won't start
    // retroactively until the next visit; acceptable since the toggle is visible from
    // the first screen onward.
    startDrone();
    startAmbientNotes();

    return () => {
      window.removeEventListener("resize", handleResize);
      stop();
      stopDrone();
      stopAmbientNotes();
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" />;
}
