"use client";

import { useEffect, useRef } from "react";

// Only golden tones for Arrive — warm, contained, intimate. The multi-color range
// belongs to Observe, once you've actually seen other people's presence; here it's
// still just you, alone, before that.
const GOLD: [number, number, number][] = [
  [210, 158, 32],
  [195, 140, 22],
  [225, 175, 55],
  [180, 130, 18],
];

const CONN_DIST = 70;
const CENTRAL_CONN_DIST = 200;

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
    this.vx = kind === "dust" ? (Math.random() - 0.5) * 0.18 : 0;
    this.vy = kind === "dust" ? (Math.random() - 0.5) * 0.18 : 0;
  }

  update(width: number, height: number, t: number) {
    if (this.kind === "orbit") {
      // Flattened ellipse (y * 0.35), not a circle — reads as a disc viewed at an
      // angle, closer to an orbit than particles simply spinning in place.
      this.x = this.originX + Math.cos(t * this.orbitSpeed + this.orbitAngle) * this.orbitR;
      this.y = this.originY + Math.sin(t * this.orbitSpeed + this.orbitAngle) * this.orbitR * 0.35;
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
      const pulse = 0.75 + Math.sin(t * 0.9) * 0.25;

      const outer = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 18);
      outer.addColorStop(0, `rgba(${r},${g},${b},${0.22 * pulse})`);
      outer.addColorStop(0.35, `rgba(${r},${g},${b},${0.08 * pulse})`);
      outer.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 18, 0, Math.PI * 2);
      ctx.fillStyle = outer;
      ctx.fill();

      const mid = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 7);
      mid.addColorStop(0, `rgba(${r},${g},${b},${0.55 * pulse})`);
      mid.addColorStop(0.5, `rgba(${r},${g},${b},${0.18 * pulse})`);
      mid.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 7, 0, Math.PI * 2);
      ctx.fillStyle = mid;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * (1 + Math.sin(t * 0.9) * 0.12), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,240,190,${0.92 * pulse})`;
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

export function ArriveCanvas() {
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
      // Glow sits slightly below true center, leaving room for the welcome text above it.
      centerY = height * 0.52;
    }

    function buildParticles() {
      particles = [new Particle(centerX, centerY, 5.5, [210, 158, 32], "central")];

      const orbits = [
        { r: 55, count: 5, speed: 0.18 },
        { r: 95, count: 8, speed: 0.1 },
        { r: 140, count: 12, speed: 0.065 },
        { r: 185, count: 10, speed: 0.04 },
      ];
      orbits.forEach(({ r, count, speed }) => {
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const p = new Particle(
            centerX,
            centerY,
            0.8 + Math.random() * 1.6,
            GOLD[Math.floor(Math.random() * GOLD.length)],
            "orbit"
          );
          p.orbitR = r + (Math.random() - 0.5) * 14;
          p.orbitSpeed = speed * (Math.random() > 0.5 ? 1 : -1);
          p.orbitAngle = angle;
          particles.push(p);
        }
      });

      // Sparse dust across the outer field — the same "scattered presence" texture
      // Observe uses, just monochrome gold and unpopulated by real phrases yet.
      const dustCount = Math.floor((width * height) / 22000);
      for (let i = 0; i < dustCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.min(width, height) * (0.28 + Math.random() * 0.38);
        const x = Math.max(8, Math.min(width - 8, centerX + Math.cos(angle) * dist));
        const y = Math.max(8, Math.min(height - 8, centerY + Math.sin(angle) * dist));
        particles.push(
          new Particle(x, y, 0.5 + Math.random() * 1.2, GOLD[Math.floor(Math.random() * GOLD.length)], "dust")
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
            const alpha = (1 - d / CONN_DIST) * 0.22;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.strokeStyle = `rgba(200,150,28,${alpha})`;
            ctx!.lineWidth = 0.4;
            ctx!.stroke();
          }
        }
        const dx = orbitParticles[i].x - central.x;
        const dy = orbitParticles[i].y - central.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < CENTRAL_CONN_DIST) {
          const alpha = (1 - d / CENTRAL_CONN_DIST) * 0.12;
          ctx!.beginPath();
          ctx!.moveTo(orbitParticles[i].x, orbitParticles[i].y);
          ctx!.lineTo(central.x, central.y);
          ctx!.strokeStyle = `rgba(210,160,32,${alpha})`;
          ctx!.lineWidth = 0.3;
          ctx!.stroke();
        }
      }
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let t = 0;
    let rafId: number;

    function frame() {
      ctx!.clearRect(0, 0, width, height);
      ctx!.fillStyle = "#08090e";
      ctx!.fillRect(0, 0, width, height);
      t += 0.01;
      particles.forEach((p) => p.update(width, height, t));
      drawConnections();
      particles.forEach((p) => p.draw(ctx!, t));

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(frame);
      }
    }
    frame();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" />;
}
