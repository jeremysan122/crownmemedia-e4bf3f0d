import { USERS, POST_IMAGES, AVATARS, CAPTIONS, COMMENTS, NOTIFS, DMS, STORE, CATEGORIES } from "./fixtures";
import { Heart, MessageCircle, Share2, Crown, Search, Home, Swords, Map, Bell, User, Trophy, Store as StoreIcon, MessageSquare, Settings as SetIcon, Play, Camera, Mic, Image as ImgIcon, Send, Circle, ChevronRight, TrendingUp, Users as UsersIcon, DollarSign, Activity, Shield, Zap, BarChart3, Globe, Server, AlertTriangle } from "lucide-react";

const gold = "#D4AF37";
const purple = "#5B2A86";

/* ---------- shared bits ---------- */
const Logo = ({ size = 20 }: { size?: number }) => (
  <div className="flex items-center gap-2">
    <div className="grid place-items-center rounded-lg" style={{ width: size + 8, height: size + 8, background: `linear-gradient(135deg, ${gold}, #F5D67A)`, boxShadow: `0 0 24px ${gold}80` }}>
      <Crown size={size} color="#1a0f2e" strokeWidth={2.6} />
    </div>
    <span className="font-black tracking-tight" style={{ fontSize: size, background: `linear-gradient(180deg,#F5D67A,${gold})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CROWNME</span>
  </div>
);

const Chip = ({ children, tone = "gold" }: { children: React.ReactNode; tone?: "gold" | "purple" | "crimson" | "green" | "blue" | "dark" }) => {
  const map: Record<string, React.CSSProperties> = {
    gold: { background: `${gold}22`, color: gold, border: `1px solid ${gold}55` },
    purple: { background: `${purple}33`, color: "#c8a2f0", border: `1px solid ${purple}88` },
    crimson: { background: "#e11d4822", color: "#f87191", border: "1px solid #e11d4855" },
    green: { background: "#10b98122", color: "#4ade80", border: "1px solid #10b98155" },
    blue: { background: "#3b82f622", color: "#93c5fd", border: "1px solid #3b82f655" },
    dark: { background: "#00000055", color: "#e5e5e5", border: "1px solid #ffffff22" },
  };
  return <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap inline-block" style={map[tone]}>{children}</span>;
};

const Avatar = ({ src, size = 36, ring }: { src: string; size?: number; ring?: boolean }) => (
  <div className="rounded-full overflow-hidden shrink-0" style={{ width: size, height: size, boxShadow: ring ? `0 0 0 2px ${gold}, 0 0 12px ${gold}80` : undefined }}>
    <img src={src} alt="" className="w-full h-full object-cover" />
  </div>
);

const CrownBadge = ({ score }: { score: number }) => (
  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-xs" style={{ background: `linear-gradient(135deg,${gold},#8a6a1e)`, color: "#1a0f2e" }}>
    <Crown size={11} strokeWidth={3} /> {score.toLocaleString()}
  </div>
);

const bgRoyal = { background: `radial-gradient(1200px 600px at 10% -10%, ${purple}55, transparent 60%), radial-gradient(900px 600px at 90% 110%, ${gold}22, transparent 60%), #0b0714` };

/* ============================================================
   Screen components (10)
   ============================================================ */

/* 1. FEED */
export function FeedScreen({ variant }: { variant: "mobile" | "tablet" | "desktop" }) {
  const posts = USERS.slice(0, 4).map((u, i) => ({ ...u, img: POST_IMAGES[i], caption: CAPTIONS[i], likes: 12400 - i * 2100, comments: 342 - i * 40, cat: CATEGORIES[i] }));
  const cols = variant === "desktop" ? "grid-cols-[260px_1fr_320px]" : variant === "tablet" ? "grid-cols-[80px_1fr_280px]" : "grid-cols-1";
  return (
    <div className="w-full h-full text-white overflow-hidden" style={bgRoyal}>
      {variant !== "mobile" && <TopBar variant={variant} />}
      <div className={`grid ${cols} h-[calc(100%-64px)]`}>
        {variant !== "mobile" && <SideNav variant={variant} active="Feed" />}
        <div className="overflow-hidden p-4 space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {["Global", "Following", "Nearby", ...CATEGORIES.slice(0, 6)].map((f, i) => (
              <button key={f} className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: i === 0 ? `linear-gradient(135deg,${gold},#8a6a1e)` : "#ffffff10", color: i === 0 ? "#1a0f2e" : "#e5e5e5", border: i === 0 ? "none" : `1px solid ${gold}33` }}>{f}</button>
            ))}
          </div>
          <div className={variant === "desktop" ? "grid grid-cols-2 gap-4" : "space-y-4"}>
            {posts.map((p, i) => (
              <div key={i} className="rounded-2xl overflow-hidden border" style={{ borderColor: `${gold}33`, background: "#12081f" }}>
                <div className="flex items-center gap-3 p-3">
                  <Avatar src={AVATARS[i]} ring />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm">{p.n}</span>
                      <Chip tone="gold">✓ Verified</Chip>
                    </div>
                    <div className="text-[11px] text-white/60">{p.u} · {p.city}</div>
                  </div>
                  <CrownBadge score={p.score} />
                </div>
                <div className="relative">
                  <img src={p.img} alt="" className="w-full aspect-[4/5] object-cover" />
                  <div className="absolute top-3 left-3 flex gap-1.5"><Chip tone="crimson">🔥 TRENDING</Chip><Chip tone="dark">{p.cat}</Chip></div>
                  <div className="absolute bottom-3 right-3 flex flex-col gap-2 items-center">
                    <div className="grid place-items-center w-11 h-11 rounded-full backdrop-blur-md" style={{ background: `${gold}cc` }}><Crown size={18} color="#1a0f2e" /></div>
                    <span className="text-[11px] font-bold">{(p.likes / 1000).toFixed(1)}K</span>
                    <div className="grid place-items-center w-11 h-11 rounded-full bg-black/40 backdrop-blur-md"><MessageCircle size={18} /></div>
                    <span className="text-[11px] font-bold">{p.comments}</span>
                    <div className="grid place-items-center w-11 h-11 rounded-full bg-black/40 backdrop-blur-md"><Share2 size={16} /></div>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm"><span className="font-bold">{p.u}</span> {p.caption}</p>
                  <div className="text-[11px] text-white/50 mt-1">Voted by {(p.likes).toLocaleString()} · {p.comments} comments · 2h ago</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {variant !== "mobile" && <RightRail />}
      </div>
      {variant === "mobile" && <BottomNav active="Feed" />}
    </div>
  );
}

/* 2. BATTLE */
export function BattleScreen({ variant }: { variant: "mobile" | "tablet" | "desktop" }) {
  const a = USERS[0], b = USERS[1];
  return (
    <div className="w-full h-full text-white overflow-hidden" style={bgRoyal}>
      {variant !== "mobile" && <TopBar variant={variant} />}
      <div className="p-4 h-[calc(100%-64px)] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div>
            <Chip tone="crimson">⚔️ LIVE BATTLE</Chip>
            <h1 className="text-2xl font-black mt-1" style={{ color: gold }}>Fashion Throne · Final</h1>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-white/60">Ends in</div>
            <div className="text-3xl font-black tabular-nums" style={{ color: gold }}>02:47:19</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
          {[a, b].map((u, i) => (
            <div key={i} className="relative rounded-2xl overflow-hidden border-2 flex flex-col" style={{ borderColor: i === 0 ? gold : purple }}>
              <img src={POST_IMAGES[i === 0 ? 0 : 3]} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,transparent 30%,#000000ee)" }} />
              <div className="relative mt-auto p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Avatar src={AVATARS[i]} size={40} ring />
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{u.n}</div>
                    <div className="text-[11px] text-white/70 truncate">{u.u}</div>
                  </div>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-white/70">Votes</span>
                  <span className="text-2xl font-black tabular-nums" style={{ color: i === 0 ? gold : "#c8a2f0" }}>{i === 0 ? "184,204" : "162,891"}</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full" style={{ width: i === 0 ? "53%" : "47%", background: i === 0 ? `linear-gradient(90deg,${gold},#f5d67a)` : `linear-gradient(90deg,${purple},#c8a2f0)` }} />
                </div>
                <button className="w-full py-2.5 rounded-full font-black text-sm" style={{ background: i === 0 ? gold : purple, color: i === 0 ? "#1a0f2e" : "white" }}>🗳️ VOTE {i === 0 ? "AURELIA" : "MALIK"}</button>
              </div>
              {i === 0 && <div className="absolute top-3 left-3"><Chip tone="gold">👑 LEADING</Chip></div>}
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: `${gold}33`, background: "#0d0518" }}>
          <div className="text-[10px] uppercase tracking-widest text-white/60 mb-2">🔴 Live comments · 4,821 watching</div>
          <div className="space-y-1.5">
            {COMMENTS.slice(0, variant === "mobile" ? 3 : 5).map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <Avatar src={AVATARS[i + 2]} size={22} />
                <span className="font-semibold" style={{ color: gold }}>{c.u}</span>
                <span className="truncate text-white/80">{c.t}</span>
                <span className="ml-auto text-white/40 shrink-0">{c.ago}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {variant === "mobile" && <BottomNav active="Battles" />}
    </div>
  );
}

/* 3. LEADERBOARDS */
export function LeaderboardScreen({ variant }: { variant: "mobile" | "tablet" | "desktop" }) {
  const scopes = ["Global", "Country", "State", "City", "School", "Category", "Friends"];
  return (
    <div className="w-full h-full text-white overflow-hidden" style={bgRoyal}>
      {variant !== "mobile" && <TopBar variant={variant} />}
      <div className="p-4 h-[calc(100%-64px)] overflow-hidden flex flex-col">
        <div className="flex items-baseline justify-between mb-3">
          <h1 className="text-2xl font-black" style={{ color: gold }}>👑 The Royal Court</h1>
          <div className="flex gap-1">{["Today", "Weekly", "Monthly"].map((t, i) => <Chip key={t} tone={i === 1 ? "gold" : "dark"}>{t}</Chip>)}</div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
          {scopes.map((s, i) => <button key={s} className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: i === 0 ? `linear-gradient(135deg,${gold},#8a6a1e)` : "#ffffff10", color: i === 0 ? "#1a0f2e" : "#e5e5e5" }}>{s}</button>)}
        </div>
        {/* Podium */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[1, 0, 2].map((idx, pos) => {
            const u = USERS[idx];
            const h = pos === 1 ? 120 : 90;
            return (
              <div key={idx} className="flex flex-col items-center justify-end">
                <Avatar src={AVATARS[idx]} size={pos === 1 ? 64 : 48} ring />
                <div className="mt-1 text-center">
                  <div className="text-xs font-bold truncate max-w-[100px]">{u.n}</div>
                  <div className="text-[10px] text-white/60">{u.score.toLocaleString()} pts</div>
                </div>
                <div className="w-full mt-2 rounded-t-xl grid place-items-center font-black text-2xl" style={{ height: h, background: pos === 1 ? `linear-gradient(180deg,${gold},#8a6a1e)` : pos === 0 ? "linear-gradient(180deg,#e5e5e5,#8a8a8a)" : "linear-gradient(180deg,#cd7f32,#7a4a1a)", color: "#1a0f2e" }}>
                  {pos === 1 ? "1" : pos === 0 ? "2" : "3"}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden space-y-1.5">
          {USERS.slice(3, variant === "mobile" ? 9 : 12).map((u, i) => (
            <div key={u.u} className="flex items-center gap-3 p-2.5 rounded-xl border" style={{ borderColor: `${gold}22`, background: "#0d0518" }}>
              <div className="font-black text-lg w-6 text-center" style={{ color: gold }}>{i + 4}</div>
              <Avatar src={AVATARS[i + 3]} size={36} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{u.n} <span className="text-white/50 font-normal">{u.u}</span></div>
                <div className="text-[11px] text-white/50">{u.city} · {u.wins}W · {u.crowns} 👑</div>
              </div>
              <div className="text-right">
                <div className="font-black tabular-nums" style={{ color: gold }}>{u.score.toLocaleString()}</div>
                <div className="text-[10px] text-emerald-400">▲ +{240 - i * 20}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {variant === "mobile" && <BottomNav active="Ranks" />}
    </div>
  );
}

/* 4. PROFILE */
export function ProfileScreen({ variant }: { variant: "mobile" | "tablet" | "desktop" }) {
  const u = USERS[0];
  return (
    <div className="w-full h-full text-white overflow-hidden" style={bgRoyal}>
      {variant !== "mobile" && <TopBar variant={variant} />}
      <div className="h-[calc(100%-64px)] overflow-hidden">
        <div className="relative h-40">
          <img src={POST_IMAGES[8]} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,transparent,#0b0714)" }} />
        </div>
        <div className="px-4 -mt-12 relative">
          <div className="flex items-end justify-between">
            <Avatar src={AVATARS[0]} size={96} ring />
            <div className="flex gap-2 mb-2">
              <button className="px-4 py-2 rounded-full font-bold text-sm" style={{ background: gold, color: "#1a0f2e" }}>Follow</button>
              <button className="px-4 py-2 rounded-full font-bold text-sm border" style={{ borderColor: gold, color: gold }}>⚔ Battle</button>
              <button className="px-3 py-2 rounded-full border" style={{ borderColor: `${gold}55` }}>✉</button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <h1 className="text-2xl font-black">{u.n}</h1>
            <Chip tone="gold">✓ VERIFIED</Chip>
            <Chip tone="purple">👑 ROYAL PASS</Chip>
          </div>
          <div className="text-sm text-white/70">{u.u} · {u.city}</div>
          <p className="mt-2 text-sm">Editor-in-chief of my own timeline. Fashion · Travel · Art. Currently reigning over Monaco 👑</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[["Followers", u.followers], ["Following", u.following], ["Crowns", `${u.crowns}`], ["Wins", `${u.wins}`]].map(([k, v]) => (
              <div key={k} className="rounded-xl p-2 text-center border" style={{ borderColor: `${gold}33`, background: "#0d0518" }}>
                <div className="text-lg font-black" style={{ color: gold }}>{v}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/60">{k}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {["Fashion #1", "Travel #4", "Art #12", "Luxury #2"].map((r) => <Chip key={r} tone="gold">🏆 {r}</Chip>)}
          </div>
          <div className="mt-3 flex gap-4 border-b" style={{ borderColor: `${gold}22` }}>
            {["Crowns 128", "Scrolls 42", "Battles 84", "Gifts 312"].map((t, i) => (
              <div key={t} className="pb-2 text-sm font-bold" style={{ color: i === 0 ? gold : "#ffffff88", borderBottom: i === 0 ? `2px solid ${gold}` : undefined }}>{t}</div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {POST_IMAGES.slice(0, variant === "mobile" ? 6 : 9).map((p, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
                <img src={p} alt="" className="w-full h-full object-cover" />
                <div className="absolute bottom-1 left-1"><Chip tone="gold">👑 {(2400 - i * 200)}</Chip></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {variant === "mobile" && <BottomNav active="Profile" />}
    </div>
  );
}

/* 5. STORE */
export function StoreScreen({ variant }: { variant: "mobile" | "tablet" | "desktop" }) {
  const cols = variant === "desktop" ? "grid-cols-4" : variant === "tablet" ? "grid-cols-3" : "grid-cols-2";
  return (
    <div className="w-full h-full text-white overflow-hidden" style={bgRoyal}>
      {variant !== "mobile" && <TopBar variant={variant} />}
      <div className="p-4 h-[calc(100%-64px)] overflow-hidden flex flex-col">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h1 className="text-2xl font-black" style={{ color: gold }}>Royal Store</h1>
            <div className="text-xs text-white/60">Boosts, gifts, subscriptions and Shekels</div>
          </div>
          <div className="rounded-full px-3 py-1.5 border flex items-center gap-1.5" style={{ borderColor: gold, background: "#0d0518" }}>
            <Crown size={14} color={gold} /><span className="font-black tabular-nums" style={{ color: gold }}>24,812 ₪</span>
          </div>
        </div>
        <div className={`grid ${cols} gap-3 flex-1 min-h-0 overflow-hidden`}>
          {STORE.slice(0, variant === "mobile" ? 8 : 12).map((s, i) => (
            <div key={s.name} className="relative rounded-2xl p-3 border flex flex-col" style={{ borderColor: `${gold}33`, background: "linear-gradient(160deg,#180a2b,#0a0316)" }}>
              {s.tag && <div className="absolute -top-2 left-3"><Chip tone={s.tag === "BEST VALUE" ? "green" : s.tag === "ELITE" ? "purple" : "crimson"}>{s.tag}</Chip></div>}
              <div className="text-3xl mb-1">{s.icon}</div>
              <div className="font-black text-sm">{s.name}</div>
              <div className="text-[11px] text-white/60 flex-1">{s.desc}</div>
              <button className="mt-2 py-1.5 rounded-full text-xs font-black" style={{ background: i % 3 === 0 ? gold : `${gold}22`, color: i % 3 === 0 ? "#1a0f2e" : gold, border: i % 3 === 0 ? "none" : `1px solid ${gold}55` }}>{s.price}</button>
            </div>
          ))}
        </div>
      </div>
      {variant === "mobile" && <BottomNav active="Store" />}
    </div>
  );
}

/* 6. NOTIFICATIONS */
export function NotificationsScreen({ variant }: { variant: "mobile" | "tablet" | "desktop" }) {
  return (
    <div className="w-full h-full text-white overflow-hidden" style={bgRoyal}>
      {variant !== "mobile" && <TopBar variant={variant} />}
      <div className="p-4 h-[calc(100%-64px)] overflow-hidden">
        <div className="flex items-baseline justify-between mb-3">
          <h1 className="text-2xl font-black" style={{ color: gold }}>Royal Herald</h1>
          <div className="flex gap-1">{["All", "Mentions", "Gifts", "Battles"].map((t, i) => <Chip key={t} tone={i === 0 ? "gold" : "dark"}>{t}</Chip>)}</div>
        </div>
        <div className="space-y-1.5">
          {NOTIFS.slice(0, variant === "mobile" ? 8 : 10).map((n, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: i < 3 ? `${gold}55` : `${gold}22`, background: i < 3 ? "#160a2a" : "#0d0518" }}>
              <div className="grid place-items-center w-10 h-10 rounded-full text-lg" style={{ background: `${gold}22`, border: `1px solid ${gold}55` }}>{n.icon}</div>
              <Avatar src={AVATARS[i % AVATARS.length]} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-sm">{n.t}</div>
                <div className="text-[11px] text-white/50">{n.ago}</div>
              </div>
              {i < 3 && <span className="w-2 h-2 rounded-full" style={{ background: gold }} />}
            </div>
          ))}
        </div>
      </div>
      {variant === "mobile" && <BottomNav active="Alerts" />}
    </div>
  );
}

/* 7. CROWN MAP */
export function MapScreen({ variant }: { variant: "mobile" | "tablet" | "desktop" }) {
  return (
    <div className="w-full h-full text-white overflow-hidden relative" style={{ background: "#050310" }}>
      {variant !== "mobile" && <TopBar variant={variant} />}
      <div className="relative h-[calc(100%-64px)] overflow-hidden">
        {/* stylized map */}
        <div className="absolute inset-0" style={{ background: `radial-gradient(1200px 800px at 30% 40%, ${purple}66, transparent 60%), radial-gradient(1000px 700px at 70% 60%, #1e3a8a55, transparent 60%), #050310` }} />
        <svg viewBox="0 0 800 500" className="absolute inset-0 w-full h-full opacity-40">
          {Array.from({ length: 40 }).map((_, i) => <line key={i} x1={i * 20} y1={0} x2={i * 20} y2={500} stroke={gold} strokeOpacity={0.08} />)}
          {Array.from({ length: 25 }).map((_, i) => <line key={i} x1={0} y1={i * 20} x2={800} y2={i * 20} stroke={gold} strokeOpacity={0.08} />)}
        </svg>
        {/* pins */}
        {[[15, 22], [28, 30], [45, 40], [60, 25], [72, 45], [40, 60], [55, 70], [80, 65], [22, 55], [65, 35]].map(([x, y], i) => (
          <div key={i} className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)" }}>
            <div className="grid place-items-center rounded-full" style={{ width: 40 + (i % 3) * 10, height: 40 + (i % 3) * 10, background: `${gold}33`, border: `2px solid ${gold}`, boxShadow: `0 0 30px ${gold}88` }}>
              <Avatar src={AVATARS[i % AVATARS.length]} size={28 + (i % 3) * 4} />
            </div>
          </div>
        ))}
        {/* overlay search */}
        <div className="absolute top-4 left-4 right-4 flex gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-full backdrop-blur-md" style={{ background: "#00000088", border: `1px solid ${gold}55` }}>
            <Search size={14} color={gold} /><span className="text-sm text-white/70">Search royals, cities, crowns…</span>
          </div>
          <button className="px-3 py-2 rounded-full backdrop-blur-md text-xs font-bold" style={{ background: gold, color: "#1a0f2e" }}>Filters</button>
        </div>
        {/* bottom sheet */}
        <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl p-4 backdrop-blur-xl" style={{ background: "#0b0714ee", borderTop: `1px solid ${gold}55` }}>
          <div className="w-10 h-1 rounded-full bg-white/30 mx-auto mb-3" />
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="font-black" style={{ color: gold }}>Nearby Crowns · Monaco</h3>
            <Chip tone="gold">42 royals within 5 km</Chip>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {USERS.slice(0, 6).map((u, i) => (
              <div key={u.u} className="shrink-0 w-40 rounded-xl p-2 border" style={{ borderColor: `${gold}33`, background: "#12081f" }}>
                <div className="flex items-center gap-2"><Avatar src={AVATARS[i]} size={32} ring /><div className="min-w-0"><div className="text-xs font-bold truncate">{u.n}</div><div className="text-[10px] text-white/60 truncate">{u.city}</div></div></div>
                <div className="mt-1.5 flex items-center justify-between"><Chip tone="gold">👑 #{i + 1}</Chip><span className="text-[10px] text-white/60">{(0.3 + i * 0.4).toFixed(1)} km</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {variant === "mobile" && <BottomNav active="Map" />}
    </div>
  );
}

/* 8. CAMERA / CREATE */
export function CameraScreen({ variant }: { variant: "mobile" | "tablet" | "desktop" }) {
  return (
    <div className="w-full h-full text-white overflow-hidden relative" style={{ background: "#000" }}>
      <img src={POST_IMAGES[0]} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#000000cc 0%,transparent 20%,transparent 70%,#000000ee 100%)" }} />
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
        <button className="w-9 h-9 rounded-full grid place-items-center bg-black/50 backdrop-blur">✕</button>
        <div className="flex gap-1.5">
          {["Fashion", "Travel", "Art"].map((c, i) => <Chip key={c} tone={i === 0 ? "gold" : "dark"}>{c}</Chip>)}
        </div>
        <button className="w-9 h-9 rounded-full grid place-items-center bg-black/50 backdrop-blur">⚙</button>
      </div>
      {/* Right filter rail */}
      <div className="absolute right-3 top-1/3 flex flex-col gap-3">
        {["✨", "👑", "💎", "🌹", "🔥"].map((f, i) => (
          <div key={i} className="w-11 h-11 rounded-full grid place-items-center text-lg backdrop-blur-md" style={{ background: i === 1 ? gold : "#00000088", border: `1px solid ${gold}55` }}>{f}</div>
        ))}
      </div>
      {/* timer */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-md" style={{ background: "#00000088", border: `1px solid ${gold}55` }}>
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="font-black tabular-nums text-sm" style={{ color: gold }}>00:17 / 00:30</span>
      </div>
      {/* Mode switcher */}
      <div className="absolute bottom-32 left-0 right-0 flex justify-center gap-4 text-xs font-bold tracking-widest uppercase">
        {["Photo", "Video", "Scroll", "Battle"].map((m, i) => <span key={m} style={{ color: i === 1 ? gold : "#ffffff88" }}>{m}</span>)}
      </div>
      {/* Bottom bar */}
      <div className="absolute bottom-6 left-0 right-0 flex items-center justify-around px-8">
        <div className="w-14 h-14 rounded-lg overflow-hidden border-2" style={{ borderColor: gold }}><img src={POST_IMAGES[5]} alt="" className="w-full h-full object-cover" /></div>
        <div className="relative">
          <div className="w-20 h-20 rounded-full grid place-items-center" style={{ background: gold, boxShadow: `0 0 40px ${gold}` }}>
            <div className="w-16 h-16 rounded-full border-4" style={{ borderColor: "#1a0f2e" }} />
          </div>
        </div>
        <div className="w-14 h-14 rounded-full grid place-items-center bg-black/50 backdrop-blur border" style={{ borderColor: `${gold}55` }}><Camera size={20} color={gold} /></div>
      </div>
    </div>
  );
}

/* 9. MESSAGES */
export function MessagesScreen({ variant }: { variant: "mobile" | "tablet" | "desktop" }) {
  const showThread = variant !== "mobile";
  return (
    <div className="w-full h-full text-white overflow-hidden" style={bgRoyal}>
      {variant !== "mobile" && <TopBar variant={variant} />}
      <div className={`h-[calc(100%-64px)] grid ${showThread ? "grid-cols-[340px_1fr]" : "grid-cols-1"}`}>
        <div className="border-r overflow-hidden" style={{ borderColor: `${gold}22` }}>
          <div className="p-3">
            <div className="flex items-center gap-2 mb-3">
              <h1 className="text-xl font-black" style={{ color: gold }}>Messages</h1>
              <Chip tone="crimson">6 new</Chip>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-full" style={{ background: "#0d0518", border: `1px solid ${gold}33` }}>
              <Search size={14} color={gold} /><span className="text-xs text-white/60">Search royals…</span>
            </div>
          </div>
          <div className="px-2 space-y-0.5">
            {DMS.map((d, i) => (
              <div key={d.u} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: i === 0 ? "#160a2a" : "transparent" }}>
                <div className="relative"><Avatar src={AVATARS[i]} size={40} ring={i < 3} />
                  {d.online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0b0714]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between"><span className="font-bold text-sm truncate">{d.n}</span><span className="text-[10px] text-white/50 shrink-0">{d.ago}</span></div>
                  <div className="flex items-center gap-1"><span className="text-xs text-white/60 truncate flex-1">{d.last}</span>
                    {d.unread > 0 && <span className="text-[10px] font-black rounded-full px-1.5 shrink-0" style={{ background: gold, color: "#1a0f2e" }}>{d.unread}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {showThread && (
          <div className="flex flex-col">
            <div className="p-3 border-b flex items-center gap-3" style={{ borderColor: `${gold}22` }}>
              <Avatar src={AVATARS[0]} size={40} ring />
              <div><div className="font-bold text-sm flex items-center gap-1.5">Luna Aether <Chip tone="gold">✓</Chip></div><div className="text-[11px] text-emerald-400">● online now</div></div>
              <div className="ml-auto flex gap-2 text-white/60"><Mic size={16} /><ImgIcon size={16} /></div>
            </div>
            <div className="flex-1 p-4 space-y-3 overflow-hidden">
              {[
                { me: false, t: "sending the crown back 👑" },
                { me: true, t: "you already earned it, keep it" },
                { me: false, t: "next battle friday 8pm eastern?" },
                { me: true, t: "locked in. category: fashion. stake 5,000 ₪" },
                { me: false, t: "🎁 sent you a Diamond Crown" },
              ].map((m, i) => (
                <div key={i} className={`flex ${m.me ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[70%] px-3 py-2 rounded-2xl text-sm" style={{ background: m.me ? `linear-gradient(135deg,${gold},#8a6a1e)` : "#12081f", color: m.me ? "#1a0f2e" : "white", border: m.me ? "none" : `1px solid ${gold}22` }}>{m.t}</div>
                </div>
              ))}
              <div className="flex items-center gap-1 text-xs text-white/50"><Avatar src={AVATARS[0]} size={20} /><span>Luna is typing<span className="animate-pulse">…</span></span></div>
            </div>
            <div className="p-3 border-t flex items-center gap-2" style={{ borderColor: `${gold}22` }}>
              <button className="w-9 h-9 rounded-full grid place-items-center" style={{ background: `${gold}22` }}>🎁</button>
              <div className="flex-1 px-3 py-2 rounded-full text-sm text-white/60" style={{ background: "#0d0518", border: `1px solid ${gold}33` }}>Message…</div>
              <button className="w-9 h-9 rounded-full grid place-items-center" style={{ background: gold }}><Send size={16} color="#1a0f2e" /></button>
            </div>
          </div>
        )}
      </div>
      {variant === "mobile" && <BottomNav active="DMs" />}
    </div>
  );
}

/* 10. SETTINGS / ADMIN */
export function SettingsScreen({ variant }: { variant: "mobile" | "tablet" | "desktop" }) {
  const groups = [
    { title: "Account", items: ["Edit profile", "Username & handle", "Email & phone", "Language & region"] },
    { title: "Privacy", items: ["Private account", "Blocked accounts", "Muted words", "Restricted accounts"] },
    { title: "Notifications", items: ["Push notifications", "Email", "Battle alerts", "Gift alerts"] },
    { title: "Wallet & Payments", items: ["Shekel balance · 24,812 ₪", "Payout method", "Purchase history", "Tax documents"] },
    { title: "Royal Pass", items: ["Manage subscription", "Perks & benefits", "Billing history", "Cancel plan"] },
    { title: "Verification", items: ["Identity verified ✓", "Age verified ✓", "Creator program", "Request premium check"] },
    { title: "Security", items: ["Two-factor auth", "Active sessions (3)", "Login alerts", "Change password"] },
    { title: "Appearance", items: ["Royal Dark (default)", "Accent color", "Reduce motion", "Text size"] },
  ];
  const cols = variant === "desktop" ? "grid-cols-3" : variant === "tablet" ? "grid-cols-2" : "grid-cols-1";
  return (
    <div className="w-full h-full text-white overflow-hidden" style={bgRoyal}>
      {variant !== "mobile" && <TopBar variant={variant} />}
      <div className="p-4 h-[calc(100%-64px)] overflow-hidden flex flex-col">
        <h1 className="text-2xl font-black mb-3" style={{ color: gold }}>Settings</h1>
        <div className="flex items-center gap-3 p-3 rounded-2xl border mb-3" style={{ borderColor: `${gold}55`, background: "#12081f" }}>
          <Avatar src={AVATARS[0]} size={48} ring />
          <div className="flex-1"><div className="font-bold flex items-center gap-1.5">Aurelia Voss <Chip tone="gold">✓</Chip> <Chip tone="purple">👑 ROYAL PASS</Chip></div><div className="text-xs text-white/60">@aurelia.royal · Monaco, MC</div></div>
          <ChevronRight color={gold} />
        </div>
        <div className={`grid ${cols} gap-3 flex-1 min-h-0 overflow-hidden`}>
          {groups.slice(0, variant === "mobile" ? 6 : 8).map((g) => (
            <div key={g.title} className="rounded-2xl border p-3" style={{ borderColor: `${gold}33`, background: "#0d0518" }}>
              <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: gold }}>{g.title}</div>
              <div className="space-y-1">
                {g.items.map((it) => (
                  <div key={it} className="flex items-center justify-between py-1.5 text-sm border-b last:border-0" style={{ borderColor: `${gold}11` }}>
                    <span className="text-white/85">{it}</span><ChevronRight size={14} color="#ffffff55" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {variant === "mobile" && <BottomNav active="Settings" />}
    </div>
  );
}

/* Admin dashboard for desktop only (used as one of the 10 screens for desktop set) */
export function AdminScreen({ variant }: { variant: "mobile" | "tablet" | "desktop" }) {
  const stats = [
    { label: "Live users", value: "48,214", d: "▲ 12.4%", tone: "green", icon: Activity },
    { label: "DAU", value: "1.24M", d: "▲ 6.8%", tone: "green", icon: UsersIcon },
    { label: "MAU", value: "18.7M", d: "▲ 4.1%", tone: "green", icon: Globe },
    { label: "New signups today", value: "12,842", d: "▲ 22.1%", tone: "green", icon: TrendingUp },
    { label: "Revenue today", value: "$284,120", d: "▲ 18.2%", tone: "green", icon: DollarSign },
    { label: "Revenue MTD", value: "$6.42M", d: "▲ 9.6%", tone: "green", icon: DollarSign },
    { label: "Royal Pass subs", value: "312,480", d: "▲ 3.4%", tone: "green", icon: Crown },
    { label: "Retention D30", value: "68.4%", d: "▲ 1.2%", tone: "green", icon: Shield },
    { label: "Churn", value: "2.1%", d: "▼ 0.3%", tone: "green", icon: AlertTriangle },
    { label: "API p95", value: "142ms", d: "healthy", tone: "green", icon: Server },
    { label: "DB CPU", value: "38%", d: "healthy", tone: "green", icon: Server },
    { label: "Realtime conns", value: "204,819", d: "stable", tone: "green", icon: Zap },
  ];
  return (
    <div className="w-full h-full text-white overflow-hidden" style={{ background: "#06040e" }}>
      <div className="h-12 border-b flex items-center px-4 gap-4" style={{ borderColor: `${gold}22`, background: "#0a0618" }}>
        <Logo size={18} /><span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${gold}22`, color: gold }}>ADMIN COMMAND CENTER</span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> All systems operational</span>
          <span className="text-white/60">v3.4.12 · prod</span>
        </div>
      </div>
      <div className="grid grid-cols-[220px_1fr] h-[calc(100%-48px)]">
        <div className="border-r p-2 space-y-0.5 text-xs" style={{ borderColor: `${gold}22` }}>
          {["Overview", "Realtime", "Users", "Content", "Moderation", "Finance", "Stripe health", "DB health", "Cloud spend", "Security", "Reports", "Broadcasts", "Feature flags", "Audit log", "Error logs", "Support"].map((s, i) => (
            <div key={s} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: i === 0 ? `${gold}22` : "transparent", color: i === 0 ? gold : "#ffffff99" }}><span className="w-1 h-1 rounded-full" style={{ background: i === 0 ? gold : "#ffffff44" }} />{s}</div>
          ))}
        </div>
        <div className="p-3 overflow-hidden">
          <div className="grid grid-cols-6 gap-2 mb-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border p-2.5" style={{ borderColor: `${gold}22`, background: "#0a0618" }}>
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-white/60"><s.icon size={10} />{s.label}</div>
                <div className="text-lg font-black mt-0.5" style={{ color: gold }}>{s.value}</div>
                <div className="text-[9px] text-emerald-400">{s.d}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 h-[calc(100%-140px)]">
            <div className="col-span-2 rounded-lg border p-3" style={{ borderColor: `${gold}22`, background: "#0a0618" }}>
              <div className="flex items-center justify-between mb-2"><div className="text-xs font-bold uppercase tracking-widest text-white/70">Revenue · last 30 days</div><Chip tone="green">▲ 22.4% MoM</Chip></div>
              <svg viewBox="0 0 600 180" className="w-full h-40">
                <defs><linearGradient id="g1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={gold} stopOpacity="0.6" /><stop offset="1" stopColor={gold} stopOpacity="0" /></linearGradient></defs>
                {(() => {
                  const pts = Array.from({ length: 30 }).map((_, i) => [i * 20, 140 - (Math.sin(i / 3) * 30 + i * 2.2 + Math.random() * 10)]);
                  const d = "M" + pts.map(p => p.join(",")).join(" L");
                  return (<>
                    <path d={`${d} L580,180 L0,180 Z`} fill="url(#g1)" />
                    <path d={d} fill="none" stroke={gold} strokeWidth={2} />
                    {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2} fill={gold} />)}
                  </>);
                })()}
                {[0, 45, 90, 135].map(y => <line key={y} x1={0} x2={600} y1={y} y2={y} stroke={gold} strokeOpacity="0.08" />)}
              </svg>
              <div className="grid grid-cols-4 gap-2 mt-2 text-center">
                {[["Stripe", "$284K"], ["Royal Pass", "$1.2M"], ["Gifts", "$482K"], ["Boosts", "$318K"]].map(([k, v]) => (
                  <div key={k}><div className="text-[10px] text-white/60 uppercase">{k}</div><div className="font-black text-sm" style={{ color: gold }}>{v}</div></div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border p-3 overflow-hidden" style={{ borderColor: `${gold}22`, background: "#0a0618" }}>
              <div className="text-xs font-bold uppercase tracking-widest text-white/70 mb-2 flex items-center justify-between">Realtime activity <span className="text-[10px] text-emerald-400">● LIVE</span></div>
              <div className="space-y-1.5 text-[11px]">
                {[
                  ["👑", "@aurelia.royal claimed Fashion crown"],
                  ["⚔️", "New battle: @kingmalik vs @rexregal"],
                  ["🎁", "@sofia sent Diamond Crown → @luna"],
                  ["💰", "Empire Treasury purchased · $599.99"],
                  ["✅", "12 verifications approved (batch)"],
                  ["🚀", "Boost activated · @nikodivine"],
                  ["🔥", "Post trending in Berlin, DE"],
                  ["📸", "Scroll uploaded · @ivorybloom"],
                  ["🏆", "New #1 in Cars – Global"],
                  ["👤", "342 new signups (last 60s)"],
                ].map(([e, t], i) => (
                  <div key={i} className="flex gap-2 items-start"><span>{e}</span><span className="text-white/85 truncate flex-1">{t}</span><span className="text-white/40">{i}s</span></div>
                ))}
              </div>
            </div>
            <div className="col-span-3 grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3" style={{ borderColor: `${gold}22`, background: "#0a0618" }}>
                <div className="text-xs font-bold uppercase tracking-widest text-white/70 mb-2">Top cities</div>
                {[["New York, US", "142K"], ["London, UK", "118K"], ["Lagos, NG", "94K"], ["Dubai, AE", "82K"], ["Tokyo, JP", "76K"]].map(([c, v], i) => (
                  <div key={c} className="flex items-center gap-2 mb-1.5"><span className="w-4 text-xs text-white/50">{i + 1}</span><span className="text-xs flex-1">{c}</span><div className="h-1.5 rounded-full flex-1" style={{ background: "#ffffff10" }}><div className="h-full rounded-full" style={{ width: `${80 - i * 12}%`, background: gold }} /></div><span className="text-xs font-bold" style={{ color: gold }}>{v}</span></div>
                ))}
              </div>
              <div className="rounded-lg border p-3" style={{ borderColor: `${gold}22`, background: "#0a0618" }}>
                <div className="text-xs font-bold uppercase tracking-widest text-white/70 mb-2">Moderation queue</div>
                {[["Reported posts", 42, "crimson"], ["Reported users", 18, "crimson"], ["Verification requests", 214, "gold"], ["Sensitive appeals", 12, "purple"], ["Ban appeals", 6, "purple"]].map(([k, v, t]) => (
                  <div key={k as string} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: `${gold}11` }}><span className="text-xs">{k}</span><Chip tone={t as any}>{v}</Chip></div>
                ))}
              </div>
              <div className="rounded-lg border p-3" style={{ borderColor: `${gold}22`, background: "#0a0618" }}>
                <div className="text-xs font-bold uppercase tracking-widest text-white/70 mb-2">Platform mix</div>
                {[["iOS", 48, gold], ["Android", 38, "#c8a2f0"], ["Web · Desktop", 10, "#4ade80"], ["Web · Tablet", 4, "#f87191"]].map(([k, v, c]) => (
                  <div key={k as string} className="mb-2"><div className="flex justify-between text-xs mb-1"><span>{k}</span><span className="font-bold" style={{ color: c as string }}>{v}%</span></div><div className="h-1.5 rounded-full" style={{ background: "#ffffff10" }}><div className="h-full rounded-full" style={{ width: `${v}%`, background: c as string }} /></div></div>
                ))}
                <div className="mt-3 text-[10px] text-white/50">Storage: 4.2 TB / 10 TB · Bandwidth: 82 TB / mo</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- shared shells ---------- */
function TopBar({ variant }: { variant: "tablet" | "desktop" }) {
  return (
    <div className="h-16 border-b flex items-center px-4 gap-4" style={{ borderColor: `${gold}22`, background: "#08051288" }}>
      <Logo size={22} />
      {variant === "desktop" && (
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-full max-w-xl" style={{ background: "#0d0518", border: `1px solid ${gold}33` }}>
          <Search size={14} color={gold} /><span className="text-sm text-white/60">Search royals, cities, crowns…</span>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <div className="rounded-full px-3 py-1.5 border flex items-center gap-1.5" style={{ borderColor: gold, background: "#0d0518" }}>
          <Crown size={12} color={gold} /><span className="font-black tabular-nums text-xs" style={{ color: gold }}>24,812</span>
        </div>
        <div className="w-9 h-9 rounded-full grid place-items-center relative" style={{ background: `${gold}22` }}><Bell size={16} color={gold} /><span className="absolute top-1 right-1 w-4 h-4 rounded-full grid place-items-center text-[9px] font-black" style={{ background: gold, color: "#1a0f2e" }}>7</span></div>
        <Avatar src={AVATARS[0]} size={36} ring />
      </div>
    </div>
  );
}

function SideNav({ variant, active }: { variant: "tablet" | "desktop"; active: string }) {
  const items = [
    { i: Home, l: "Feed" }, { i: Play, l: "Scrolls" }, { i: Swords, l: "Battles" }, { i: Map, l: "Map" },
    { i: Trophy, l: "Ranks" }, { i: StoreIcon, l: "Store" }, { i: MessageSquare, l: "DMs" }, { i: Bell, l: "Alerts" },
    { i: User, l: "Profile" }, { i: SetIcon, l: "Settings" },
  ];
  const compact = variant === "tablet";
  return (
    <div className="border-r p-2 space-y-1 overflow-hidden" style={{ borderColor: `${gold}22` }}>
      {items.map(({ i: Icon, l }) => {
        const on = l === active;
        return (
          <div key={l} className={`flex items-center gap-3 ${compact ? "justify-center" : "px-3"} py-2.5 rounded-xl`} style={{ background: on ? `linear-gradient(90deg,${gold}33,transparent)` : "transparent", border: on ? `1px solid ${gold}55` : "1px solid transparent", color: on ? gold : "#ffffffaa" }}>
            <Icon size={18} />{!compact && <span className="text-sm font-semibold">{l}</span>}
          </div>
        );
      })}
    </div>
  );
}

function RightRail() {
  return (
    <div className="border-l p-3 space-y-3 overflow-hidden" style={{ borderColor: `${gold}22` }}>
      <div className="rounded-2xl p-3 border" style={{ borderColor: `${gold}33`, background: "linear-gradient(160deg,#160a2a,#0a0316)" }}>
        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: gold }}>Your rank</div>
        <div className="text-2xl font-black" style={{ color: gold }}>#3 Global</div>
        <div className="text-[11px] text-white/60">▲ up 2 places this week</div>
      </div>
      <div className="rounded-2xl p-3 border" style={{ borderColor: `${gold}33`, background: "#0d0518" }}>
        <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: gold }}>🔥 Trending crowns</div>
        {USERS.slice(0, 5).map((u, i) => (
          <div key={u.u} className="flex items-center gap-2 py-1.5 border-b last:border-0" style={{ borderColor: `${gold}11` }}>
            <Avatar src={AVATARS[i]} size={28} />
            <div className="flex-1 min-w-0"><div className="text-xs font-bold truncate">{u.n}</div><div className="text-[10px] text-white/60 truncate">{u.city}</div></div>
            <CrownBadge score={u.score} />
          </div>
        ))}
      </div>
      <div className="rounded-2xl p-3 border" style={{ borderColor: `${gold}33`, background: "#0d0518" }}>
        <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: gold }}>Live battles</div>
        {[["Fashion Throne", "184K vs 162K"], ["Car Crown", "94K vs 88K"], ["Chef Wars", "42K vs 41K"]].map(([t, s]) => (
          <div key={t} className="flex items-center justify-between py-1.5 text-xs"><span className="font-bold">{t}</span><span className="text-white/60">{s}</span></div>
        ))}
      </div>
    </div>
  );
}

function BottomNav({ active }: { active: string }) {
  const items = [
    { i: Home, l: "Feed" }, { i: Swords, l: "Battles" }, { i: Camera, l: "Create" }, { i: Bell, l: "Alerts" }, { i: User, l: "Profile" },
  ];
  return (
    <div className="absolute bottom-0 left-0 right-0 h-16 backdrop-blur-xl border-t flex items-center justify-around" style={{ borderColor: `${gold}33`, background: "#08051288" }}>
      {items.map(({ i: Icon, l }) => {
        const on = l === active || (l === "Create" && active === "Create");
        if (l === "Create") return (
          <div key={l} className="w-12 h-12 rounded-2xl grid place-items-center -mt-4" style={{ background: `linear-gradient(135deg,${gold},#8a6a1e)`, boxShadow: `0 8px 24px ${gold}66` }}>
            <Icon size={20} color="#1a0f2e" />
          </div>
        );
        return (
          <div key={l} className="flex flex-col items-center gap-0.5" style={{ color: on ? gold : "#ffffff88" }}>
            <Icon size={20} />
            <span className="text-[9px] font-bold tracking-wider uppercase">{l}</span>
          </div>
        );
      })}
    </div>
  );
}
