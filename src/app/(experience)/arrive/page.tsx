import Link from "next/link";
import { ArriveCanvas } from "./arrive-canvas";

export default function ArrivePage() {
  return (
    <div className="relative flex flex-1 flex-col bg-[#08090e]">
      <ArriveCanvas />

      <div className="fixed top-10 left-12 z-10">
        <div className="text-[22px] font-light tracking-[5px] text-white/82">Refugio[Safe Mode]</div>
        <div className="mt-1 text-[11px] tracking-[2.5px] text-white/25">No tienes que demostrar nada.</div>
      </div>

      <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center gap-2 px-8 text-center">
        <div className="-translate-y-[10vh]">
          <div className="text-[22px] font-light tracking-[5px] text-white/82">Bienvenido.</div>
          <div className="mt-2 text-[13px] leading-[1.8] tracking-[.3px] text-white/50">
            Este es un lugar seguro
            <br />
            para ser tú.
          </div>
        </div>
      </div>

      <Link
        href="/preview/presence"
        className="group/enter fixed bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2.5"
      >
        <span className="h-9 w-9 rounded-full border border-white/20 transition-colors duration-400 group-hover/enter:border-[rgba(200,160,30,0.7)]" />
        <span className="text-[10px] tracking-[1.5px] text-white/22">entrar</span>
      </Link>
    </div>
  );
}
