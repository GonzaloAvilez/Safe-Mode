import { getTranslations } from "next-intl/server";
import { ScreenCta } from "../_shared/screen-cta";
import { ScreenHeader } from "../_shared/screen-header";
import { ScreenPrompt } from "../_shared/screen-prompt";
import { ArriveCanvas } from "./arrive-canvas";

export default async function ArrivePage() {
  const t = await getTranslations("arrive");
  const subcopyLines = t("subcopy").split("\n");

  return (
    <>
      <ArriveCanvas />

      <ScreenHeader tagline={t("tagline")} />

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center px-8">
        <ScreenPrompt
          className="-translate-y-[10vh]"
          headline={t("welcome")}
          subcopy={
            <>
              {subcopyLines[0]}
              <br />
              {subcopyLines[1]}
            </>
          }
        />
      </div>

      <ScreenCta href="/observe" label={t("enterCta")} accentRgb="200,160,30" />
    </>
  );
}
