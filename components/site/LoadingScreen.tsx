export function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-ink-950">
      <div className="flex flex-col items-center gap-4">
        <div className="size-9 animate-spin rounded-full border-2 border-white/10 border-t-sky-400" />
        <p className="text-[13px] text-ink-300">{label}…</p>
      </div>
    </div>
  );
}
