import { MailboxScreen } from "./_components/mailbox-screen";

// ADR-004 #213: where whoever holds a seal comes back to read their letters. Everything private
// happens in the browser with the seal in memory; the page itself is the same for everyone.
export default function MailboxPage() {
  return <MailboxScreen />;
}
