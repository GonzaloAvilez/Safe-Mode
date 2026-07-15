"use client";

import { useEffect, useState } from "react";

const REVEAL_MS_PER_CHAR = 35;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Reveals the matched phrase one character at a time — the mockup's explicit note
// ("la frase aparece letra a letra con fade-in lento") is what turns the match from
// an instant text-dump into something that reads as being said to you.
export function QuoteReveal({ text }: { text: string }) {
  const [visibleChars, setVisibleChars] = useState(() => (prefersReducedMotion() ? text.length : 0));

  useEffect(() => {
    if (prefersReducedMotion()) return;

    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setVisibleChars(i);
      if (i >= text.length) window.clearInterval(id);
    }, REVEAL_MS_PER_CHAR);

    return () => window.clearInterval(id);
  }, [text]);

  return <span>{text.slice(0, visibleChars)}</span>;
}
