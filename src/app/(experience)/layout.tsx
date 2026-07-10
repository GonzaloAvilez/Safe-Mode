export default function ExperienceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="scene flex flex-1 flex-col bg-background text-foreground">{children}</div>;
}
