"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { CRISIS_RESOURCE_URL } from "@/lib/safety/crisis-resource";

// AlertDialog blocks outside-click by default, but NOT the Escape key — verified by
// hand, it still closes on Escape unless the "escape-key" reason is caught here and
// canceled. Without that, someone could dismiss this without reading anything and be
// left with a permanently-disabled "entrar" (onAcknowledge only fires for the actual
// "Entendido" button's "close-press" reason). Shows on every fresh visit, no
// localStorage skip — same "never assume a returning preference" call already made
// for the sound toggle in handpan-audio.ts.
export function RulesGate({ onAcknowledge }: { onAcknowledge: () => void }) {
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
          <AlertDialog.Title className="text-[11px] tracking-[2px] text-white/50">
            BEFORE YOU ENTER
          </AlertDialog.Title>

          <AlertDialog.Description
            render={<div />}
            className="mt-5 flex flex-col gap-3 text-left text-[13px] leading-[1.8] tracking-[.2px] text-white/60"
          >
            <p>It&rsquo;s anonymous — we don&rsquo;t ask for accounts, names, or photos, only whatever you want to write.</p>
            <p>It&rsquo;s not a chat — no one replies to you directly, we show real humanity from other people.</p>
            <p>
              It doesn&rsquo;t replace professional help — if you need to talk to someone right now, there&rsquo;s real help at{" "}
              <a
                href={CRISIS_RESOURCE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-white/75 underline decoration-white/25 underline-offset-4"
              >
                {CRISIS_RESOURCE_URL}
              </a>
              .
            </p>
          </AlertDialog.Description>

          <AlertDialog.Close className="mt-6 rounded-full border border-white/20 px-8 py-2.5 text-[11px] tracking-[1.5px] text-white/70 transition-colors duration-300 hover:border-[rgba(200,160,30,0.6)] hover:text-white/90">
            Got it
          </AlertDialog.Close>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
