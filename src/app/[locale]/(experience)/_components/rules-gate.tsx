"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useTranslations } from "next-intl";
import { CRISIS_RESOURCE_URL } from "@/lib/safety/crisis-resource";

// The closed copy promises that no one replies, which stops being true the moment
// letters open (ADR-004 #212), so this rule follows letters_open. Nothing is shown
// while the flag loads, so neither promise ever appears when it isn't true. onShown
// runs once the rule is on screen.
function LettersRule({ lettersOpen, onShown }: { lettersOpen: Promise<boolean>; onShown: () => void }) {
  const t = useTranslations("rulesGate");
  const open = use(lettersOpen);
  useEffect(onShown, [onShown]);
  return <p>{t(open ? "p2LettersOpen" : "p2")}</p>;
}

// AlertDialog blocks outside-click by default, but NOT the Escape key — verified by
// hand, it still closes on Escape unless the "escape-key" reason is caught here and
// canceled. Without that, someone could dismiss this without reading anything and be
// left with a permanently-disabled "entrar" (onAcknowledge only fires for the actual
// "Entendido" button's "close-press" reason). Shows on every fresh visit, no
// localStorage skip — same "never assume a returning preference" call already made
// for the sound toggle in handpan-audio.ts.
//
// "Entendido" also waits for the letters rule: the acknowledgment is saved and this
// dialog never comes back, so accepting before that rule appears would mean never
// seeing it. The rest of the dialog doesn't wait for it.
export function RulesGate({
  lettersOpen,
  onAcknowledge,
}: {
  lettersOpen: Promise<boolean>;
  onAcknowledge: () => void;
}) {
  const t = useTranslations("rulesGate");
  const [lettersRuleShown, setLettersRuleShown] = useState(false);
  const handleLettersRuleShown = useCallback(() => setLettersRuleShown(true), []);

  return (
    <AlertDialog.Root
      defaultOpen
      onOpenChange={(open, eventDetails) => {
        if (open) return;
        if (eventDetails.reason !== "close-press") {
          eventDetails.cancel();
          return;
        }
        onAcknowledge();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-black/70 backdrop-blur-md" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(90vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/[0.08] bg-[#0f1216] px-6 py-7 text-center outline-none">
          <AlertDialog.Title className="text-[13px] tracking-[1.5px] text-white/50">
            {t("title")}
          </AlertDialog.Title>

          <AlertDialog.Description
            render={<div />}
            className="mt-5 flex flex-col gap-3 text-left text-[15px] leading-[1.7] tracking-[.2px] text-white/60"
          >
            <p>{t("p1")}</p>
            <Suspense fallback={null}>
              <LettersRule lettersOpen={lettersOpen} onShown={handleLettersRuleShown} />
            </Suspense>
            <p>
              {t.rich("p3", {
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
            </p>
          </AlertDialog.Description>

          <AlertDialog.Close
            disabled={!lettersRuleShown}
            className="mt-6 rounded-full border border-white/20 px-8 py-2.5 text-[13px] tracking-[1px] text-white/70 transition duration-300 enabled:hover:border-[rgba(200,160,30,0.6)] enabled:hover:text-white/90 disabled:opacity-40"
          >
            {t("close")}
          </AlertDialog.Close>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
