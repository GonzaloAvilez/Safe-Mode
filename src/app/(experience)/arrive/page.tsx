import { ScreenCta } from "../_shared/screen-cta";
import { ScreenHeader } from "../_shared/screen-header";
import { ScreenPrompt } from "../_shared/screen-prompt";
import { ArriveCanvas } from "./arrive-canvas";

export default function ArrivePage() {
  return (
    <>
      <ArriveCanvas />

      <ScreenHeader tagline="You don't have to prove anything." />

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center px-8">
        <ScreenPrompt
          className="-translate-y-[10vh]"
          headline="Welcome."
          subcopy={
            <>
              This is a safe place
              <br />
              to be who you are.
            </>
          }
        />
      </div>

      <ScreenCta href="/observe" label="Enter" accentRgb="200,160,30" />
    </>
  );
}
