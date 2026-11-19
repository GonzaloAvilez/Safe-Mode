// Saves a file the visitor's browser made (the card's picture) to their device. Nothing is
// uploaded: the picture only exists in this browser.
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Not at once: some browsers read the address after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// On iPhone and iPad the picture often opens in a tab instead of downloading; the person then
// saves it from there, so they get a hint. iPadOS says it's a Mac, hence the touch check.
export function isIosDevice(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
