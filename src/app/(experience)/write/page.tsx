import { EntryForm } from "./_components/entry-form";

export default function WritePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <h1 className="font-heading text-3xl font-medium tracking-tight text-foreground">
        Refugio [Safe Mode]
      </h1>
      <EntryForm />
    </div>
  );
}
