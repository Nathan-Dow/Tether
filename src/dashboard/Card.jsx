export default function Card({ title, subtitle, right, className = '', children }) {
  return (
    <section className={`rounded-xl border border-white/[0.08] bg-white/[0.015] ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-4 px-4 pt-3.5 pb-3">
          <div className="min-w-0">
            <h2 className="text-[13px] font-medium text-zinc-100">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[11.5px] text-zinc-500">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}
