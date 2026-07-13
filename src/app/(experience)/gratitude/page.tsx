import { ScreenCta } from "../_shared/screen-cta";
import { ScreenHeader } from "../_shared/screen-header";
import { GratitudeCanvas } from "./gratitude-canvas";

// Static closing screen, no input — reached from Mirror regardless of whether Write
// found a match. The corpus visual is the message: the visitor's own trace is now
// part of it, denser and warmer than Arrive's for the same reason.
export default function GratitudePage() {
  return (
    <>
      <GratitudeCanvas />

      <ScreenHeader tagline="El ciclo cierra." />

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="translate-y-[22vh]">
          <div className="text-[15px] leading-[1.9] tracking-[.3px] text-white/78">
            Gracias por permitirte estar aquí.
          </div>
          <div className="mx-auto mt-3 max-w-[320px] text-[12px] leading-[1.8] tracking-[.3px] text-white/40">
            Tu presencia ya es luz para alguien que aún no ha llegado.
          </div>
        </div>
      </div>

      <ScreenCta href="/leave-a-trace" label="seguir" accentRgb="210,158,32" />
    </>
  );
}
