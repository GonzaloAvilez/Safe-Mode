import { getTranslations } from "next-intl/server";
import { CRISIS_RESOURCE_URL } from "@/lib/safety/crisis-resource";
import { ScreenHeader } from "../_shared/screen-header";
import { ScreenPrompt } from "../_shared/screen-prompt";
import { ContributeForm } from "./_components/contribute-form";

// Not part of the numbered 9-screen flow — a direct link for workshop podmates seeding
// the corpus, so they don't have to sit through the full reflective pacing (Arrive
// through Write) just to leave a phrase; they already have the context from the brief
// shared with them separately. Kept inside (experience) for the shared dark layout, but
// intentionally has no ScreenCta — there's nowhere for this screen to send someone next,
// and it still sits behind the same site_public gate as every other route (proxy.ts).
export default async function ContributePage() {
  const t = await getTranslations("contribute");

  return (
    <>
      <ScreenHeader tagline={t("tagline")} />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-8 py-24">
        <ScreenPrompt
          headline={t("headline")}
          subcopy={
            <>
              {t.rich("subcopyIntro", {
                url: CRISIS_RESOURCE_URL,
                link: (chunks) => (
                  <a
                    href={CRISIS_RESOURCE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white/75 underline decoration-white/25 underline-offset-4"
                  >
                    {chunks}
                  </a>
                ),
              })}
              <br />
              <br />
              {t("subcopyBody1")}
              <br />
              <br />
              {t("subcopyBody2")}
              <br />
              <br />
            </>
          }
        />

        <p className="max-w-md text-center text-[14px] leading-[1.7] tracking-[.2px] text-white/30 italic">
          {t("hint")}
        </p>

        <ContributeForm />
      </div>
    </>
  );
}
