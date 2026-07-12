import { ScreenCta } from "../_shared/screen-cta";
import { ScreenHeader } from "../_shared/screen-header";
import { RememberCanvas } from "./remember-canvas";

export default function RememberPage() {
  return (
    <>
      <RememberCanvas />

      <ScreenHeader tagline="Un instante para ti." />

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center gap-2 px-8 text-center">
        <div className="-translate-y-[16vh]">
          <div className="text-[15px] leading-[1.9] tracking-[.3px] text-white/60">
            Antes de seguir, un momento a solas.
          </div>
          <div className="mx-auto mt-4 max-w-[360px] text-[13px] leading-[1.9] tracking-[.3px] text-white/45">
            ¿Hay algún momento —reciente o lejano— en que fuiste
            completamente tú, sin esperar nada a cambio?
          </div>
        </div>
      </div>

      <ScreenCta href="/write" label="seguir" accentRgb="210,215,225" />
    </>
  );
}
