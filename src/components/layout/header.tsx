interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  return (
    <header className="glass relative z-10 mx-3 mt-3 flex h-14 shrink-0 items-center gap-3 rounded-xl px-3 sm:mx-4 sm:mt-4 sm:h-16 sm:rounded-2xl sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-brand-400 shadow-[0_0_12px_rgba(74,222,128,.7)] lg:hidden" />
        <h1 className="truncate text-sm font-semibold text-white sm:text-base">{title}</h1>
      </div>
    </header>
  );
}
