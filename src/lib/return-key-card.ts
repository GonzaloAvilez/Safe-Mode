import { returnKeyQrModules } from "@/lib/return-key-qr";

// ADR-004 #212: the private keepsake card, as the picture "Guardar imagen" saves. The picture
// is drawn on a canvas in the visitor's own browser, so the seal never travels anywhere.
// What goes on it: the gift sentence and the seal's QR inside a postage stamp, and nothing
// that identifies anyone (no date, no link). It is not meant to be shared. The seal's digits
// are never written out: the QR holds them, and the QR is what opens the mailbox (decided
// 2026-11-23: visible digits only invited reading and typing them).
//
// The screen shows the same card as markup (return-key-card.tsx). Both follow the layout in
// CARD_LAYOUT, in design units: a 400 × 500 ground with the 320 × 450 card centered on it,
// drawn at 2.7 pixels per unit for 1080 × 1350 (4:5).

export const CARD_IMAGE = { width: 1080, height: 1350 } as const;
const UNITS = { width: 400, height: 500 } as const;
const SCALE = CARD_IMAGE.width / UNITS.width;

export const CARD_LAYOUT = {
  card: { x: 40, y: 25, width: 320, height: 450, radius: 20, paddingTop: 24, paddingBottom: 20, paddingX: 22 },
  brandHeight: 12,
  sentenceMinHeight: 72,
  sentenceLineHeight: 25.6,
  stamp: { width: 260, height: 210 },
  footerHeight: 13,
} as const;

export const CARD_COLORS = {
  ground: "#0b0b0c",
  glow: "rgba(210,158,32,0.12)",
  card: "#131315",
  cardBorder: "rgba(210,158,32,0.3)",
  brand: "rgba(255,255,255,0.52)",
  sentence: "rgba(255,255,255,0.88)",
  footer: "rgba(255,255,255,0.55)",
  stampPaper: "#f3eee3",
  stampInk: "#131315",
  stampFrame: "#c99a2e",
  stampText: "#7a5512",
  postmark: "#e4b34c",
} as const;

export type ReturnKeyCardSpec = {
  returnKey: string;
  sentence: string;
  labels: { brand: string; stamp: string; footer: string };
  // CSS font-family value, read from the card on screen so the picture uses the same font.
  fonts: { sans: string };
};

// A pixel size per QR module that is a whole number, so no seams show between modules.
const QR_MODULE_PX = 14;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

// Back to "0px" by value, never to what was read before: Chrome answers "" when asked for the
// current spacing after save() and scale(), and assigning "" is ignored, which left the spacing of
// one text on every text that followed.
function withLetterSpacing(ctx: CanvasRenderingContext2D, spacing: string, draw: () => void) {
  ctx.letterSpacing = spacing;
  draw();
  ctx.letterSpacing = "0px";
}

// The words broken into lines that fit `maxWidth`, the same way the browser breaks them on screen.
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawPerforations(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  // One hole every 10 units along the edge of the stamp, clockwise from its top-left corner.
  ctx.fillStyle = CARD_COLORS.stampInk;
  const hole = (px: number, py: number) => {
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let dx = 0; dx <= width; dx += 10) hole(x + dx, y);
  for (let dy = 10; dy <= height; dy += 10) hole(x + width, y + dy);
  for (let dx = width - 10; dx >= 0; dx -= 10) hole(x + dx, y + height);
  for (let dy = height - 10; dy >= 10; dy -= 10) hole(x, y + dy);
}

function drawPostmark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = CARD_COLORS.postmark;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x + 224, y + 56, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x + 224, y + 56, 18, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.2;
  for (const waveY of [94, 103, 112]) {
    ctx.beginPath();
    ctx.moveTo(x + 200, y + waveY);
    ctx.quadraticCurveTo(x + 207.5, y + waveY - 6, x + 215, y + waveY);
    ctx.quadraticCurveTo(x + 222.5, y + waveY + 6, x + 230, y + waveY);
    ctx.quadraticCurveTo(x + 237.5, y + waveY - 6, x + 245, y + waveY);
    ctx.quadraticCurveTo(x + 252.5, y + waveY + 6, x + 257, y + waveY);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// The QR is drawn in device pixels, snapped to whole pixels: scale 1, no transform.
function drawQr(ctx: CanvasRenderingContext2D, returnKey: string, centerX: number, top: number) {
  const modules = returnKeyQrModules(returnKey);
  const side = modules.length * QR_MODULE_PX;
  const left = Math.round(centerX * SCALE - side / 2);
  const topPx = Math.round(top * SCALE);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = CARD_COLORS.stampInk;
  modules.forEach((row, rowIndex) => {
    let column = 0;
    while (column < row.length) {
      if (!row[column]) {
        column += 1;
        continue;
      }
      let end = column;
      while (end < row.length && row[end]) end += 1;
      ctx.fillRect(left + column * QR_MODULE_PX, topPx + rowIndex * QR_MODULE_PX, (end - column) * QR_MODULE_PX, QR_MODULE_PX);
      column = end;
    }
  });
  ctx.restore();
}

// Draws the whole picture on a context that is CARD_IMAGE.width × CARD_IMAGE.height pixels.
export function drawReturnKeyCard(ctx: CanvasRenderingContext2D, spec: ReturnKeyCardSpec): void {
  const { card, stamp } = CARD_LAYOUT;
  const centerX = UNITS.width / 2;

  ctx.save();
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = CARD_COLORS.ground;
  ctx.fillRect(0, 0, UNITS.width, UNITS.height);
  const glow = ctx.createRadialGradient(centerX, UNITS.height * 0.45, 0, centerX, UNITS.height * 0.45, UNITS.width * 0.62);
  glow.addColorStop(0, CARD_COLORS.glow);
  glow.addColorStop(1, "rgba(210,158,32,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, UNITS.width, UNITS.height);

  roundedRect(ctx, card.x + 0.5, card.y + 0.5, card.width - 1, card.height - 1, card.radius);
  ctx.fillStyle = CARD_COLORS.card;
  ctx.fill();
  ctx.strokeStyle = CARD_COLORS.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Same rhythm as the card on screen: four rows between the paddings, with the leftover
  // height shared evenly between them (justify-between).
  const innerWidth = card.width - card.paddingX * 2;
  ctx.font = `300 16px ${spec.fonts.sans}`;
  const lines = wrapLines(ctx, `“${spec.sentence}”`, innerWidth);
  const sentenceHeight = Math.max(CARD_LAYOUT.sentenceMinHeight, lines.length * CARD_LAYOUT.sentenceLineHeight);
  const rows = CARD_LAYOUT.brandHeight + sentenceHeight + stamp.height + CARD_LAYOUT.footerHeight;
  const gap = (card.height - card.paddingTop - card.paddingBottom - rows) / 3;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let y = card.y + card.paddingTop;
  ctx.fillStyle = CARD_COLORS.brand;
  ctx.font = `400 10px ${spec.fonts.sans}`;
  withLetterSpacing(ctx, "4px", () => ctx.fillText(spec.labels.brand, centerX, y + CARD_LAYOUT.brandHeight / 2));
  y += CARD_LAYOUT.brandHeight + gap;

  ctx.fillStyle = CARD_COLORS.sentence;
  ctx.font = `300 16px ${spec.fonts.sans}`;
  const textTop = y + (sentenceHeight - lines.length * CARD_LAYOUT.sentenceLineHeight) / 2;
  lines.forEach((line, index) => ctx.fillText(line, centerX, textTop + (index + 0.5) * CARD_LAYOUT.sentenceLineHeight));
  y += sentenceHeight + gap;

  const stampX = centerX - stamp.width / 2;
  ctx.fillStyle = CARD_COLORS.stampPaper;
  ctx.fillRect(stampX + 55, y + 12, 150, 186);
  drawPerforations(ctx, stampX + 55, y + 12, 150, 186);
  ctx.strokeStyle = CARD_COLORS.stampFrame;
  ctx.lineWidth = 1;
  ctx.strokeRect(stampX + 66.5, y + 23.5, 127, 163);
  ctx.fillStyle = CARD_COLORS.stampText;
  ctx.font = `400 8px ${spec.fonts.sans}`;
  withLetterSpacing(ctx, "2.5px", () => ctx.fillText(spec.labels.stamp, stampX + 130, y + 168));
  drawPostmark(ctx, stampX, y);
  drawQr(ctx, spec.returnKey, stampX + 130, y + 30);
  y += stamp.height + gap;

  ctx.fillStyle = CARD_COLORS.footer;
  ctx.font = `400 11px ${spec.fonts.sans}`;
  withLetterSpacing(ctx, "0.4px", () => ctx.fillText(spec.labels.footer, centerX, y + CARD_LAYOUT.footerHeight / 2));

  ctx.restore();
}

// The picture as a PNG, ready to download. Waits for the page's fonts first, so the text is
// drawn in them and not in a fallback.
export async function drawReturnKeyCardImage(spec: ReturnKeyCardSpec): Promise<Blob> {
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_IMAGE.width;
  canvas.height = CARD_IMAGE.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas is not available");
  drawReturnKeyCard(ctx, spec);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("couldn't make the image"))), "image/png");
  });
}
