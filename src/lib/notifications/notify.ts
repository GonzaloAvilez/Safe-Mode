import "server-only";
import type { Locale } from "@/lib/locale";
import { noticeFor, type Notice, type NotificationEvent } from "@/lib/notifications/messages";
import { webPushChannel } from "@/lib/notifications/channels/web-push";

// ADR-005: the one call the rest of the app makes to tell an identity something happened. It
// doesn't know how the notice travels: each channel is one file under channels/ with this
// contract, so a new way to reach people (email, if accounts ever exist) is a new file here,
// and callers never change.
//
// There's deliberately no text parameter: a notice can only say one of the fixed lines in
// messages.ts, never letter content.

export type NotificationChannel = {
  name: string;
  // The channel knows each device's locale, so it asks for the notice in that locale.
  send(identityId: string, noticeIn: (locale: Locale) => Notice): Promise<void>;
};

const CHANNELS: NotificationChannel[] = [webPushChannel];

// Best-effort: a channel that fails is logged and the others still run. Callers schedule this
// with Next's after() and never wait on it, so a failed notice can't undo what triggered it.
export async function notify(identityId: string, event: NotificationEvent): Promise<void> {
  const noticeIn = (locale: Locale) => noticeFor(event, locale);
  await Promise.all(
    CHANNELS.map(async (channel) => {
      try {
        await channel.send(identityId, noticeIn);
      } catch (error) {
        console.error(`notify: the ${channel.name} channel failed`, error instanceof Error ? error.name : "unknown error");
      }
    })
  );
}
