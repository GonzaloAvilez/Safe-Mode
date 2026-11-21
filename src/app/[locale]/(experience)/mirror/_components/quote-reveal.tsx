"use client";

import { useEffect, useRef, useState } from "react";

const REVEAL_MS_PER_CHAR = 35;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type QuoteRevealProps = {
  text: string;
  // Shows the whole phrase at once: for someone coming back to a phrase they've already seen.
  // Read when the phrase first shows; changing it afterwards changes nothing.
  instant?: boolean;
  // Called once, when the whole phrase is showing. Mirror waits for it before showing what goes
  // under the phrase, so nothing visible is pushed while the card grows (#263).
  onRevealed?: () => void;
};

// Reveals the matched phrase one character at a time — the mockup's explicit note
// ("la frase aparece letra a letra con fade-in lento") is what turns the match from
// an instant text-dump into something that reads as being said to you.
export function QuoteReveal({ text, instant = false, onRevealed }: QuoteRevealProps) {
  const [showsAtOnce] = useState(() => instant || prefersReducedMotion());
  const [visibleChars, setVisibleChars] = useState(() => (showsAtOnce ? text.length : 0));
  // Kept in a ref so a new callback on every render doesn't restart the reveal.
  const onRevealedRef = useRef(onRevealed);
  useEffect(() => {
    onRevealedRef.current = onRevealed;
  });

  useEffect(() => {
    if (showsAtOnce) {
      onRevealedRef.current?.();
      return;
    }

    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setVisibleChars(i);
      if (i >= text.length) {
        window.clearInterval(id);
        onRevealedRef.current?.();
      }
    }, REVEAL_MS_PER_CHAR);

    return () => window.clearInterval(id);
  }, [text, showsAtOnce]);

  return <span>{text.slice(0, visibleChars)}</span>;
}
