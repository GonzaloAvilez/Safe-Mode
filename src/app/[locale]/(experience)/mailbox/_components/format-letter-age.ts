// How long ago a letter was written, the way the paper shows it ("hace 2 días", "2 days ago").
// Relative, never a date: a calendar date says more than the letter needs to.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

export function formatLetterAge(writtenAt: string, now: Date, locale: string): string {
  // A clock a little ahead of this one makes this negative: that reads as "now" below.
  const elapsed = now.getTime() - new Date(writtenAt).getTime();
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (elapsed < MINUTE) return format.format(0, "second");
  if (elapsed < HOUR) return format.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return format.format(-Math.floor(elapsed / HOUR), "hour");
  if (elapsed < MONTH) return format.format(-Math.floor(elapsed / DAY), "day");
  return format.format(-Math.floor(elapsed / MONTH), "month");
}
