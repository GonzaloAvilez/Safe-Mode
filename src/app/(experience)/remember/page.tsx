import { ScreenCta } from "../_shared/screen-cta";
import { ScreenHeader } from "../_shared/screen-header";
import { ScreenPrompt } from "../_shared/screen-prompt";
import { RememberCanvas } from "./remember-canvas";

export default function RememberPage() {
  return (
    <>
      <RememberCanvas />

      <ScreenHeader tagline="Un instante para ti." />

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center px-8">
        <ScreenPrompt
          className="-translate-y-[16vh]"
          headline="Antes de seguir, un momento a solas."
          subcopy="¿Hay algún momento —reciente o lejano— en que fuiste completamente tú, sin esperar nada a cambio?"
        />
      </div>

      <ScreenCta href="/write" label="seguir" accentRgb="210,215,225" />
    </>
  );
}
