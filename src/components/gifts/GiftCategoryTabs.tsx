import { CATEGORY_TABS } from "@/lib/gifts";
import { GiftCategory } from "@/types/gifts";

export default function GiftCategoryTabs({
  active,
  onChange,
  disabled = false,
}: {
  active: GiftCategory;
  onChange: (c: GiftCategory) => void;
  disabled?: boolean;
}) {
  return (
    <div className="px-5 mb-3 flex gap-2 overflow-x-auto scrollbar-none">
      {CATEGORY_TABS.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            disabled={disabled}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              isActive
                ? "bg-gradient-gold text-primary-foreground gold-shadow"
                : "bg-muted/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
