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

      <ScreenHeader tagline="The circle closes." />

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center px-8">
        <ScreenPrompt
          className="translate-y-[22vh]"
          headline="Thank you for letting yourself be here."
          subcopy="Your presence is already a light for someone who hasn't arrived yet."
        />
      </div>

      <ScreenCta href="/leave-a-trace" label="Continue" accentRgb="210,158,32" />
    </>
  );
}
