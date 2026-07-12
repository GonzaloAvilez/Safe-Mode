import { SCENE_BG_CLASS } from "./_shared/scene";

export default function ExperienceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className={`scene relative flex flex-1 flex-col text-white ${SCENE_BG_CLASS}`}>{children}</div>;
}
