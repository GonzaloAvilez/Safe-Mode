import { ScreenCta } from "../_shared/screen-cta";
import { ScreenHeader } from "../_shared/screen-header";
import { ScreenPrompt } from "../_shared/screen-prompt";
import { ArriveCanvas } from "./arrive-canvas";

export default function ArrivePage() {
  return (
    <>
      <ArriveCanvas />

      <ScreenHeader tagline="No tienes que demostrar nada." />

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center px-8">
        <ScreenPrompt
          className="-translate-y-[10vh]"
          headline="Bienvenido."
          subcopy={
            <>
              Este es un lugar seguro
              <br />
              para ser tú.
            </>
          }
        />
      </div>

      <ScreenCta href="/observe" label="entrar" accentRgb="200,160,30" />
    </>
  );
}
