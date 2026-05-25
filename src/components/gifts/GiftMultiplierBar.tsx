export default function GiftMultiplierBar({
  quantity,
  onChange,
  disabled = false,
}: {
  quantity: 1 | 5 | 10;
  onChange: (q: 1 | 5 | 10) => void;
  disabled?: boolean;
}) {
  const opts: (1 | 5 | 10)[] = [1, 5, 10];
  return (
    <div className="px-5 flex items-center justify-center gap-2 mb-3">
      {opts.map((q) => {
        const active = q === quantity;
        return (
          <button
            key={q}
            onClick={() => onChange(q)}
            disabled={disabled}
            className={`px-5 py-2 rounded-full text-sm font-bold tabular-nums transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              active
                ? "bg-gradient-gold text-primary-foreground gold-shadow"
                : "bg-muted/40 text-muted-foreground"
            }`}
          >
            ×{q}
          </button>
        );
      })}
    </div>
  );
}
