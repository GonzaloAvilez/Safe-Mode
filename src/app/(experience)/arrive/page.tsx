import { ScreenCta } from "../_shared/screen-cta";
import { ScreenHeader } from "../_shared/screen-header";
import { ArriveCanvas } from "./arrive-canvas";

export default function ArrivePage() {
  return (
    <>
      <ArriveCanvas />

      <ScreenHeader tagline="No tienes que demostrar nada." />

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center gap-2 px-8 text-center">
        <div className="-translate-y-[10vh]">
          <div className="text-[22px] font-light tracking-[5px] text-white/82">Bienvenido.</div>
          <div className="mt-2 text-[13px] leading-[1.8] tracking-[.3px] text-white/50">
            Este es un lugar seguro
            <br />
            para ser tú.
          </div>
        </div>
      </div>

      <ScreenCta href="/observe" label="entrar" accentRgb="200,160,30" />
    </>
  );
}
