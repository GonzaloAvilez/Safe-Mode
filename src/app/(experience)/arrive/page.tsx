import Link from "next/link";

export default function ArrivePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center">
      <h1 className="font-heading text-3xl font-medium tracking-tight text-foreground">
        Bienvenido.
      </h1>
      <p className="max-w-xs text-foreground/80">Este es un lugar seguro para ser tú.</p>
      <Link
        href="/write"
        className="group/enter flex flex-col items-center gap-2 text-sm text-foreground/70 transition-colors hover:text-foreground"
      >
        <span className="size-8 rounded-full border border-border transition-colors group-hover/enter:border-primary" />
        entrar
      </Link>
    </div>
  );
}
