import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";
import { Link } from "react-router-dom";

interface TopUser {
  id: string; username: string; profile_photo_url: string | null; battle_wins: number;
}

export default function TopBattlersWidget() {
  const [users, setUsers] = useState<TopUser[]>([]);

  useEffect(() => {
    supabase.from("profiles")
      .select("id, username, profile_photo_url, battle_wins")
      .gt("battle_wins", 0)
      .order("battle_wins", { ascending: false })
      .limit(5)
      .then(({ data }) => setUsers((data as TopUser[]) || []));
  }, []);

  if (!users.length) return null;

  return (
    <div className="royal-card p-3">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={14} className="text-primary" />
        <h3 className="font-display text-xs uppercase tracking-[0.2em] text-gold">Top Battlers</h3>
      </div>
      <div className="space-y-2">
        {users.map((u, i) => (
          <Link key={u.id} to={`/${u.username}`}
            className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/40 transition-colors">
            <span className="text-xs font-bold w-4 text-muted-foreground">{i + 1}</span>
            <div className="w-7 h-7 rounded-full overflow-hidden bg-muted shrink-0">
              {u.profile_photo_url && <img loading="lazy" src={u.profile_photo_url} alt="" className="w-full h-full object-cover" />}
            </div>
            <p className="flex-1 text-xs font-medium truncate">@{u.username}</p>
            <span className="text-[10px] text-primary font-bold">{u.battle_wins}W</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
