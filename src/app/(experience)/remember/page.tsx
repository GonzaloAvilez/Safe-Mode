import Link from "next/link";
import { RememberCanvas } from "./remember-canvas";

export default function RememberPage() {
  return (
    <div className="relative flex flex-1 flex-col bg-[#0a0c10]">
      <RememberCanvas />

      <div className="fixed top-10 left-12 z-10">
        <div className="text-[22px] font-light tracking-[5px] text-white/82">Refugio[Safe Mode]</div>
        <div className="mt-1 text-[11px] tracking-[2.5px] text-white/25">Un instante para ti.</div>
      </div>

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center gap-2 px-8 text-center">
        <div className="-translate-y-[16vh]">
          <div className="text-[15px] leading-[1.9] tracking-[.3px] text-white/60">
            Antes de seguir, un momento a solas.
          </div>
          <div className="mx-auto mt-4 max-w-[360px] text-[13px] leading-[1.9] tracking-[.3px] text-white/45">
            ¿Hay algún momento —reciente o lejano— en que fuiste
            completamente tú, sin esperar nada a cambio?
          </div>
        </div>
      </div>

      <Link
        href="/write"
        className="group/enter fixed bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2.5"
      >
        <span className="h-9 w-9 rounded-full border border-white/20 transition-colors duration-400 group-hover/enter:border-[rgba(210,215,225,0.7)]" />
        <span className="text-[10px] tracking-[1.5px] text-white/22">seguir</span>
      </Link>
    </div>
  );
}
