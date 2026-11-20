import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { AuroraBackground } from "@/components/ui/aurora-background";

export default function NotFound() {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden p-6 text-white">
      <AuroraBackground />
      <section className="glass-panel relative z-10 w-full max-w-md rounded-2xl p-7 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-400/20 bg-brand-500/10 text-brand-200">
          <FileQuestion aria-hidden="true" className="h-6 w-6" />
        </span>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Error 404</p>
        <h1 className="mt-2 text-lg font-semibold">No encontramos esta página</h1>
        <p className="mt-2 text-sm leading-6 text-white/65">
          El enlace puede estar incompleto o el registro ya no existe.
        </p>
        <Link href="/dashboard" className="glass-btn-primary mt-6 justify-center">
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}
