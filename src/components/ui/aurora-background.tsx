export function AuroraBackground() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden bg-[#05060c]">
      {/* halo superior */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_60%_at_50%_-10%,rgba(29,78,216,0.35),transparent_60%)]" />

      {/* blobs de color — familia azul de marca */}
      <div className="aurora-blob absolute -left-40 -top-24 h-[34rem] w-[34rem] animate-aurora-1 rounded-full bg-brand-600/30 blur-[140px] mix-blend-screen" />
      <div className="aurora-blob absolute right-[-8rem] top-[6%] h-[28rem] w-[28rem] animate-aurora-2 rounded-full bg-indigo-500/20 blur-[130px] mix-blend-screen" />
      <div className="aurora-blob absolute bottom-[-12rem] left-[18%] h-[36rem] w-[36rem] animate-aurora-3 rounded-full bg-cyan-500/12 blur-[160px] mix-blend-screen" />
      <div className="aurora-blob absolute bottom-[-10rem] right-[8%] h-[26rem] w-[26rem] animate-aurora-2 rounded-full bg-brand-400/18 blur-[140px] mix-blend-screen" />

      {/* grano sutil para evitar banding */}
      <div className="bg-noise absolute inset-0 opacity-[0.035] mix-blend-overlay" />

      {/* viñeta */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.6)_100%)]" />
    </div>
  );
}
