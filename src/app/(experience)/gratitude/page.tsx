import { ScreenCta } from "../_shared/screen-cta";
import { ScreenHeader } from "../_shared/screen-header";
import { ScreenPrompt } from "../_shared/screen-prompt";
import { GratitudeCanvas } from "./gratitude-canvas";

// Reached from Mirror regardless of whether Write found a match — the copy here is
// deliberately the same either way (the match/no-match distinction is Mirror's job,
// via the dimmed node, not something this screen should restate in words). This is a
// transition, not the real closing moment: the visitor hasn't left a trace yet, and
// even once they do, it isn't part of the public corpus until a human approves it
// (see admin-audit-not-gate-model). The actual "circle closes" beat lives in
// leave-a-trace/page.tsx's own post-submit state, after the ecosystem-completing act.
export default function GratitudePage() {
  return (
    <>
      <GratitudeCanvas />

      <ScreenHeader tagline="Something is different now." />

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center px-8">
        <ScreenPrompt
          className="translate-y-[22vh]"
          headline="Thank you for letting yourself be here."
        />
      </div>

      <ScreenCta href="/leave-a-trace" label="Continue" accentRgb="210,158,32" />
    </>
  );
}
