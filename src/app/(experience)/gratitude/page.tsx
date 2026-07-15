import { ScreenCta } from "../_shared/screen-cta";
import { ScreenHeader } from "../_shared/screen-header";
import { ScreenPrompt } from "../_shared/screen-prompt";
import { GratitudeCanvas } from "./gratitude-canvas";

// Static closing screen, no input — reached from Mirror regardless of whether Write
// found a match. The corpus visual is the message: the visitor's own trace is now
// part of it, denser and warmer than Arrive's for the same reason.
export default function GratitudePage() {
  return (
    <>
      <GratitudeCanvas />

      <ScreenHeader tagline="El ciclo cierra." />

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center px-8">
        <ScreenPrompt
          className="translate-y-[22vh]"
          headline="Gracias por permitirte estar aquí."
          subcopy="Tu presencia ya es luz para alguien que aún no ha llegado."
        />
      </div>

      <ScreenCta href="/leave-a-trace" label="seguir" accentRgb="210,158,32" />
    </>
  );
}
