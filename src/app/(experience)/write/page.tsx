import { EntryForm } from "./_components/entry-form";

export default function WritePage() {
  return (
    <div className="relative flex flex-1 flex-col bg-[#0a0c10]">
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(225,230,235,0.05)_0%,rgba(225,230,235,0)_70%)]" />
      </div>

      <div className="fixed top-10 left-12 z-10">
        <div className="text-[22px] font-light tracking-[5px] text-white/82">Refugio[Safe Mode]</div>
        <div className="mt-1 text-[11px] tracking-[2.5px] text-white/25">Sin la presión de quedar bien.</div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-8 py-24">
        <EntryForm />
      </div>
    </div>
  );
}
