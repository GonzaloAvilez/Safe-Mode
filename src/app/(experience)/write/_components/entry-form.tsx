"use client";

import { useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { CRISIS_RESOURCE_URL } from "@/lib/safety/crisis-resource";
import { writeMirrorHandoff } from "../../_shared/mirror-handoff";
import { Searching } from "./searching";

const MAX_TEXT_LENGTH = 800;

export type Outcome =
  | { type: "crisis" }
  | { type: "general_flagged" }
  | { type: "cap_reached" }
  | { type: "error"; message: string };

type EntryFormProps = {
  outcome: Outcome | null;
  onOutcomeChange: (outcome: Outcome | null) => void;
};

export function EntryForm({ outcome, onOutcomeChange }: EntryFormProps) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const body = await res.json();

      if (!res.ok) {
        onOutcomeChange({ type: "error", message: body.error ?? "Something went wrong." });
        setSubmitting(false);
        return;
      }

      if (body.type === "matched") {
        writeMirrorHandoff({ outcome: "matched", text: body.phrase.text, entryId: body.entryId });
        router.push("/mirror");
        // Leave submitting=true — Searching stays on screen through the route swap
        // instead of the form flashing back for a frame first.
        return;
      }

      if (body.type === "no_match") {
        // No phrase to mirror back, but the visitor still passes through Mirror
        // rather than dead-ending here — see MirrorPage's no_match rendering.
        writeMirrorHandoff({ outcome: "no_match", entryId: body.entryId });
        router.push("/mirror");
        return;
      }

      onOutcomeChange({ type: body.type });
      setSubmitting(false);
    } catch {
      onOutcomeChange({ type: "error", message: "We couldn't connect. Try again." });
      setSubmitting(false);
    }
  }

  function reset() {
    setText("");
    onOutcomeChange(null);
  }

  if (submitting) {
    return <Searching />;
  }

  if (outcome) {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <OutcomeMessage outcome={outcome} />
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-white/20 px-6 py-2 text-[11px] tracking-[1.5px] text-white/50 transition-colors duration-300 hover:border-[rgba(200,160,30,0.5)] hover:text-white/75"
        >
          Write again
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-5">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MAX_TEXT_LENGTH}
        placeholder="write here, just as it is..."
        rows={7}
        required
        className="w-full resize-none rounded-lg border border-white/12 bg-white/[0.02] p-4 text-[14px] leading-[1.8] tracking-[.2px] text-white/85 placeholder:text-white/25 outline-none transition-colors duration-300 focus:border-[rgba(200,160,30,0.4)]"
      />
      <button
        type="submit"
        disabled={text.trim().length === 0}
        className="self-center rounded-full border border-white/20 px-8 py-2.5 text-[11px] tracking-[1.5px] text-white/60 transition-colors duration-300 hover:border-[rgba(200,160,30,0.6)] hover:text-white/85 disabled:pointer-events-none disabled:opacity-30"
      >
        Send
      </button>
    </form>
  );
}

function OutcomeMessage({ outcome }: { outcome: Outcome }) {
  switch (outcome.type) {
    case "crisis":
      return (
        <div className="flex flex-col gap-3 text-[13px] leading-[1.9] tracking-[.3px] text-white/55">
          <p>You&rsquo;re not alone. If you feel like you need to talk to someone right now, here&rsquo;s help:</p>
          <a
            href={CRISIS_RESOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-white/75 underline decoration-white/30 underline-offset-4"
          >
            {CRISIS_RESOURCE_URL}
          </a>
        </div>
      );
    case "general_flagged":
      return (
        <p className="text-[13px] leading-[1.9] tracking-[.3px] text-white/55">
          Your text couldn&rsquo;t be published this time.
        </p>
      );
    case "cap_reached":
      return (
        <p className="text-[13px] leading-[1.9] tracking-[.3px] text-white/55">
          We&rsquo;ve used up today&rsquo;s space, come back tomorrow.
        </p>
      );
    case "error":
      return <p className="text-[13px] leading-[1.9] tracking-[.3px] text-white/55">{outcome.message}</p>;
  }
}
