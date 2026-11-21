// #263: on desktop (lg, 1024px and up), the way to reach whoever left the phrase is a postage
// stamp mounted on the phrase card's bottom-right corner, as if the phrase were an envelope you
// can answer. Below lg it stays a pill under the phrase. These classes only apply from lg, on top
// of each control's own pill classes.
//
// In Spanish "sello" already means the return key: the stamp is never named in the UI, it only
// carries each control's own label.
export const CORNER_STAMP_CLASSES =
  "lg:mt-0 lg:h-[112px] lg:w-[96px] lg:flex-col lg:justify-center lg:gap-2 lg:rounded-[4px] lg:px-2 lg:py-3 " +
  "lg:text-center lg:text-balance lg:text-[12px] lg:leading-[1.35] lg:tracking-[.3px] lg:-rotate-[5deg] " +
  "lg:bg-[rgba(22,18,10,0.94)] lg:shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] " +
  "lg:outline lg:outline-1 lg:outline-dashed lg:outline-offset-[3px] lg:outline-[rgba(210,158,32,0.35)]";

// Only for a stamp that can be pressed: it straightens a little and warms under the pointer, staying
// opaque over the card. A stamp that only says something (a letter on its way, letters paused) stays still.
export const PRESSABLE_STAMP_CLASSES = "lg:hover:-rotate-[2deg] lg:hover:bg-[rgba(38,30,12,0.97)]";

// Where a stamp sits: hanging off the card's bottom-right corner. Below lg it's just the next
// thing under the phrase.
export const CORNER_STAMP_SLOT_CLASSES = "lg:absolute lg:-bottom-8 lg:-right-14";

// Words that belong to the stamp (its hint, or why it couldn't open just now): beside it, to the
// right, on desktop; under it otherwise.
export const CORNER_STAMP_CAPTION_CLASSES =
  "lg:absolute lg:left-full lg:top-1/2 lg:ml-5 lg:w-56 lg:-translate-y-1/2 lg:text-left";
