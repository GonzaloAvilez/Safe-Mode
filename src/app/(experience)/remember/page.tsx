import { ScreenCta } from "../_shared/screen-cta";
import { ScreenHeader } from "../_shared/screen-header";
import { ScreenPrompt } from "../_shared/screen-prompt";
import { RememberCanvas } from "./remember-canvas";

export default function RememberPage() {
  return (
    <>
      <RememberCanvas />

      <ScreenHeader tagline="A moment for you." />

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center px-8">
        <ScreenPrompt
          className="-translate-y-[16vh]"
          headline="Before you continue, a moment alone."
          subcopy="Is there a moment — recent or distant — when you were completely yourself, expecting nothing in return?"
        />
      </div>

      <ScreenCta href="/write" label="Continue" accentRgb="210,215,225" />
    </>
  );
}
