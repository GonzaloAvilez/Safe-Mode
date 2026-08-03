"use client";

import { useEffect, useRef } from "react";
import { SCENE_BG_HEX } from "../_shared/scene";
import { startAnimationLoop } from "../_shared/animation-loop";

// Violet reads as "someone else" — distinct from every other screen's gold (the
// visitor's own presence, in Arrive/Remember/Searching) and from Observe's multicolor
// corpus (humanity in aggregate, not one specific other). Here it's one specific
// stranger whose words matched.
const OTHER: [number, number, number] = [170, 130, 230];
const SELF: [number, number, number] = [210, 158, 32];

// Self orbits other rather than holding a fixed position — closest at 3 o'clock and
// 9 o'clock each revolution (radius modulated at 2x the orbit angle), farthest at
// 12/6, so there are exactly two approaches per rotation, never quite arriving.
// 0.05 rad/s felt too slow; 1.3x reads as more restless without losing the calm pace
// the rest of the screen keeps.
const ORBIT_ANGULAR_SPEED = 0.05 * 1.3;

type MirrorCanvasProps = {
  // 1 for a real match (the other's node reads as present), near-0 for no_match —
  // the node is still there (nobody's presence is erased for not matching), just
  // barely lit, since there's no one specific phrase behind it yet.
  otherIntensity?: number;
};

export function MirrorCanvas({ otherIntensity = 1 }: MirrorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let otherX = 0;
    let otherY = 0;
    let selfX = 0;
    let selfY = 0;

    function resize() {
      width = canvas!.width = window.innerWidth;
      height = canvas!.height = window.innerHeight;
      otherX = width / 2;
      otherY = height * 0.3;
    }
    resize();

    function handleResize() {
      resize();
    }
    window.addEventListener("resize", handleResize);

    function drawCurve() {
      ctx!.beginPath();
      ctx!.moveTo(otherX, otherY + 20);
      ctx!.bezierCurveTo(
        otherX + (selfX - otherX) * 0.5,
        otherY + (selfY - otherY) * 0.35,
        otherX + (selfX - otherX) * 0.4,
        otherY + (selfY - otherY) * 0.75,
        selfX,
        selfY - 12
      );
      ctx!.strokeStyle = `rgba(165,125,220,${0.15 * otherIntensity})`;
      ctx!.lineWidth = 0.7;
      ctx!.stroke();
    }

    function drawOther(pulse: number) {
      const [r, g, b] = OTHER;
      const alpha = pulse * otherIntensity;

      const outer = ctx!.createRadialGradient(otherX, otherY, 0, otherX, otherY, 130);
      outer.addColorStop(0, `rgba(${r},${g},${b},${0.16 * alpha})`);
      outer.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx!.beginPath();
      ctx!.arc(otherX, otherY, 130, 0, Math.PI * 2);
      ctx!.fillStyle = outer;
      ctx!.fill();

      const mid = ctx!.createRadialGradient(otherX, otherY, 0, otherX, otherY, 44);
      mid.addColorStop(0, `rgba(200,175,255,${0.75 * alpha})`);
      mid.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx!.beginPath();
      ctx!.arc(otherX, otherY, 44, 0, Math.PI * 2);
      ctx!.fillStyle = mid;
      ctx!.fill();

      ctx!.beginPath();
      ctx!.arc(otherX, otherY, 5, 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(220,200,255,${0.92 * alpha})`;
      ctx!.fill();
    }

    function drawSelf(pulse: number) {
      const [r, g, b] = SELF;
      const halo = ctx!.createRadialGradient(selfX, selfY, 0, selfX, selfY, 22);
      halo.addColorStop(0, `rgba(${r},${g},${b},${0.5 * pulse})`);
      halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx!.beginPath();
      ctx!.arc(selfX, selfY, 22, 0, Math.PI * 2);
      ctx!.fillStyle = halo;
      ctx!.fill();

      ctx!.beginPath();
      ctx!.arc(selfX, selfY, 2.5, 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(${r},${g},${b},${Math.min(1, pulse)})`;
      ctx!.fill();
    }

    function drawFrame(elapsedMs: number) {
      ctx!.clearRect(0, 0, width, height);
      ctx!.fillStyle = SCENE_BG_HEX;
      ctx!.fillRect(0, 0, width, height);

      const t = elapsedMs * 0.001;
      const otherPulse = 0.78 + Math.sin(t * 0.7) * 0.22;
      // Slightly out of phase with the other's — two separate presences breathing
      // on their own, not a synchronized pair.
      const selfPulse = 0.78 + Math.sin(t * 0.7 + 1.1) * 0.22;

      // Radius swings between 0.6x and 1.4x the base distance, one full swing per
      // half-revolution (angle * 2) — minimum right at angle 0 and π, i.e. 3 o'clock
      // and 9 o'clock, kept clear of other's inner core (44px mid-glow) even at its
      // closest.
      const baseRadius = Math.max(80, Math.min(150, width * 0.13));
      const angle = t * ORBIT_ANGULAR_SPEED;
      const radius = baseRadius - Math.cos(angle * 2) * baseRadius * 0.4;
      selfX = otherX + Math.cos(angle) * radius;
      selfY = otherY + Math.sin(angle) * radius * 0.75;

      drawCurve();
      drawOther(otherPulse);
      drawSelf(selfPulse);
    }
    const { stop } = startAnimationLoop(drawFrame);

    return () => {
      window.removeEventListener("resize", handleResize);
      stop();
    };
  }, [otherIntensity]);

  return <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" />;
}
