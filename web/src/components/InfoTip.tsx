// Small "i" button that explains a panel in one line on hover, focus or tap.
export default function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-label={text}
        className="ml-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-muted/60 font-mono text-[10px] font-semibold text-muted hover:border-glow hover:text-glow focus:border-glow focus:text-glow">
        i
      </button>
      <span role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-6 z-40 w-64 -translate-x-1/2 rounded-lg border border-line bg-ink px-3 py-2 text-left font-sans text-xs font-normal normal-case leading-relaxed tracking-normal text-soft opacity-0 shadow-xl transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        {text}
      </span>
    </span>
  )
}
