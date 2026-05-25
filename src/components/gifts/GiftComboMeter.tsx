import { Flame } from "lucide-react";

export default function GiftComboMeter({ count }: { count: number }) {
  if (count < 2) return null;
  const tier = count >= 10 ? "MEGA" : count >= 5 ? "FIRE" : "COMBO";
  return (
    <div className="absolute top-3 right-5 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-crimson text-destructive-foreground text-xs font-bold animate-[scale-in_0.2s_ease-out] gold-shadow">
      <Flame size={12} fill="currentColor" />
      <span>×{count}</span>
      <span className="opacity-80">{tier}</span>
    </div>
  );
}
