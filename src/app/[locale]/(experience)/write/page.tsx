"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ScreenHeader } from "../_shared/screen-header";
import { ScreenPrompt } from "../_shared/screen-prompt";
import { EntryForm, type Outcome } from "./_components/entry-form";

export default function WritePage() {
  const t = useTranslations("write");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  return (
    <>
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(225,230,235,0.05)_0%,rgba(225,230,235,0)_70%)]" />
      </div>

      <ScreenHeader tagline={t("tagline")} />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-8 py-24">
        {!outcome && (
          <ScreenPrompt
            headline={t("headline")}
            subcopy={t("subcopy")}
          />
        )}

        <EntryForm outcome={outcome} onOutcomeChange={setOutcome} />
      </div>
    </>
  );
}
