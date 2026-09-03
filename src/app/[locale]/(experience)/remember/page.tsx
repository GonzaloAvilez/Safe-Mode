import { getTranslations } from "next-intl/server";
import { ScreenCta } from "../_shared/screen-cta";
import { ScreenHeader } from "../_shared/screen-header";
import { ScreenPrompt } from "../_shared/screen-prompt";
import { RememberCanvas } from "./remember-canvas";

export default async function RememberPage() {
  const t = await getTranslations("remember");
  const tc = await getTranslations("common");

  return (
    <>
      <RememberCanvas />

      <ScreenHeader tagline={t("tagline")} />

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center px-8">
        <ScreenPrompt
          className="-translate-y-[16vh]"
          headline={t("headline")}
          subcopy={t("subcopy")}
        />
      </div>

      <ScreenCta href="/write" label={tc("continue")} accentRgb="210,215,225" />
    </>
  );
}
