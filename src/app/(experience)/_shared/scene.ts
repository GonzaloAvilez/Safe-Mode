// Single source of truth for the dark scene background shared by every screen in the
// flow. Previously each screen picked its own near-black hex independently (#08090e,
// #080c14, #0a0c10) with no reason for the difference — just drift from being built
// at different times. Canvas draw loops need the raw hex for ctx.fillStyle; the layout
// needs the Tailwind class — both derive from this one value.
export const SCENE_BG_HEX = "#0a0c10";
export const SCENE_BG_CLASS = "bg-[#0a0c10]";
