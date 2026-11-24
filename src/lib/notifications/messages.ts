import "server-only";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import type { Locale } from "@/lib/locale";

// ADR-005: what a notice says, per event and locale. The text lives in the message catalogs,
// next to the rest of Refugio's copy. A notice shows on a lock screen, so it never carries letter
// content, the phrase, or anything the person wrote: only these fixed lines.

export type NotificationEvent = "letter_delivered";

export type Notice = { title: string; body: string };

const CATALOG_KEYS: Record<NotificationEvent, keyof typeof en.notifications> = {
  letter_delivered: "letterDelivered",
};

const CATALOGS: Record<Locale, { notifications: typeof en.notifications }> = { en, es };

export function noticeFor(event: NotificationEvent, locale: Locale): Notice {
  const { title, body } = CATALOGS[locale].notifications[CATALOG_KEYS[event]];
  return { title, body };
}
