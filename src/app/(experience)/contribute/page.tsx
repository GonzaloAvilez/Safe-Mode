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
export default function ContributePage() {
  return (
    <>
      <ScreenHeader tagline="A quick contribution." />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-8 py-24">
        <ScreenPrompt
          headline="Leave a phrase for Refugio's wall."
          subcopy={
            <>
              This isn&rsquo;t a chat, and it doesn&rsquo;t replace professional help — if you need to
              talk to someone right now, there&rsquo;s real help at{" "}
              <a
                href={CRISIS_RESOURCE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-white/75 underline decoration-white/25 underline-offset-4"
              >
                {CRISIS_RESOURCE_URL}
              </a>.
              <br />
              <br />
              Refugio is a place for leaving — and finding — a reflection of ourselves in others.
              Like a wall of anonymous notes, not a journal or a therapy app. Someone arriving
              should feel that real people were here before them, not read something written just
              to fill space.
              <br />
              <br />
              No tags, no signatures, no need to sound a certain way. A full thought, a fragment, a
              half-formed idea — all of it counts. Whatever you&rsquo;re actually feeling is enough,
              no need to reach for variety. You can leave more than one.
              <br />
              <br />
            </>
          }
        />

        <p className="max-w-md text-center text-[12px] leading-[1.8] tracking-[.2px] text-white/30 italic">
          If it helps: maybe something from today — the frustration of a stuck prompt, the
          tiredness by hour six, the moment something finally clicked.
        </p>

        <ContributeForm />
      </div>
    </>
  );
}
