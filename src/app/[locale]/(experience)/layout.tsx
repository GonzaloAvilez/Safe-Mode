import { SCENE_BG_CLASS } from "./_shared/scene";
import { OpenMailboxFromNotice } from "./_shared/notifications/open-mailbox-from-notice";
import { LanguageSelector } from "./_shared/language-selector";
import { SoundToggle } from "./_shared/sound-toggle";

export default function ExperienceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`scene relative flex flex-1 flex-col text-white ${SCENE_BG_CLASS}`}>
      <LanguageSelector />
      <SoundToggle />
      {/* ADR-005: a tapped letter notice, while Refugio is already open, brings it to the mailbox. */}
      <OpenMailboxFromNotice />
      {children}
    </div>
  );
}
