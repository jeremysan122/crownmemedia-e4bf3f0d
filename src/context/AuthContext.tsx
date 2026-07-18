import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { captureRefFromUrl, redeemPendingInvite } from "@/lib/inviteRedeem";

export type Profile = {
  id: string;
  username: string;
  email?: string | null;
  dob?: string;
  age_confirmed?: boolean;
  profile_photo_url: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  followers_count: number;
  following_count: number;
  votes_received: number;
  votes_given: number;
  crowns_held: number;
  crowns_total: number;
  battle_wins: number;
  is_suspended: boolean;
  liked_posts_public?: boolean;
  avatar_position_y?: number | null;
  default_category?: string | null;
  reduce_motion?: boolean;
  larger_text?: boolean;
  high_contrast?: boolean;
};

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isModerator: boolean;
  isAdmin: boolean;
  ageConfirmed: boolean | null;
  needsOnboarding: boolean;
  markOnboarded: () => Promise<void>;
  onboardingStep: number;
  setOnboardingStep: (step: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModerator, setIsModerator] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState<boolean | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStepState] = useState(0);

  const loadProfileAndRoles = async (uid: string, email?: string | null) => {
    try {
      const { data: prof } = await supabase.rpc("get_my_profile").maybeSingle();
      setProfile(prof as Profile | null);
      const { data: rolesData } = await supabase.rpc("get_my_admin_roles");
      const roles = (rolesData as { role: string }[] | null) ?? [];
      const adminRoles = ["admin", "super_admin", "finance_admin", "security_admin", "content_admin", "support_admin"];
      const moderatorRoles = [...adminRoles, "moderator"];
      setIsAdmin(roles.some((r) => adminRoles.includes(r.role)));
      setIsModerator(roles.some((r) => moderatorRoles.includes(r.role)));
      const { data: priv } = await supabase
        .from("profiles_private")
        .select("age_confirmed, onboarded_at, welcome_email_sent_at, onboarding_step")
        .eq("id", uid)
        .maybeSingle();
      setAgeConfirmed(priv ? !!priv.age_confirmed : false);
      const privAny = priv as { onboarded_at?: string | null; welcome_email_sent_at?: string | null; onboarding_step?: number | null } | null;
      setNeedsOnboarding(!!priv && !privAny?.onboarded_at);
      setOnboardingStepState(privAny?.onboarding_step ?? 0);
      // Fire welcome email once, after we have a profile and a verified user.
      if (priv && !privAny?.welcome_email_sent_at && email && (prof as Profile | null)) {
        const p = prof as Profile;
        supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "welcome",
            recipientEmail: email,
            idempotencyKey: `welcome-${uid}`,
            templateData: { username: p.username, first_name: (p as unknown as { first_name?: string }).first_name },
          },
        }).then(async () => {
          await supabase.from("profiles_private").update({ welcome_email_sent_at: new Date().toISOString() }).eq("id", uid);
        }).catch(() => { /* noop — will retry next session */ });
      }
    } catch (err) {
      console.error("[AuthContext] loadProfileAndRoles failed:", err);
    }
  };

  const markOnboarded = async () => {
    if (!user) return;
    const stamp = new Date().toISOString();
    // Use UPDATE (not upsert): the `no_direct_age_or_dob_update` policy's
    // WITH CHECK compares incoming age_confirmed/dob to existing values, and
    // an upsert that omits those columns trips the check. The private row is
    // created at signup, so UPDATE is the right primitive here.
    const { error } = await supabase
      .from("profiles_private")
      .update({ onboarded_at: stamp })
      .eq("id", user.id);
    if (error) {
      console.error("[AuthContext] markOnboarded failed:", error);
      throw error;
    }
    setNeedsOnboarding(false);
  };

  const setOnboardingStep = async (step: number) => {
    setOnboardingStepState(step);
    if (!user) return;
    const { error } = await supabase
      .from("profiles_private")
      .update({ onboarding_step: step })
      .eq("id", user.id);
    if (error) console.error("[AuthContext] setOnboardingStep failed:", error);
  };


  useEffect(() => {
    // Capture ?ref=CODE on first paint regardless of auth state — so deep
    // links from desktop/mobile will be redeemed the moment the user is
    // logged in (whether that's now or after they sign up).
    try { captureRefFromUrl(); } catch { /* noop */ }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // defer to avoid deadlock
        setTimeout(() => loadProfileAndRoles(sess.user.id, sess.user.email), 0);
        setTimeout(() => { redeemPendingInvite().catch(() => {}); }, 250);
      } else {
        setProfile(null);
        setIsModerator(false);
        setIsAdmin(false);
        setAgeConfirmed(null);
        setNeedsOnboarding(false);
      }
    });
    // Missing refresh token is normal for logged-out users. Do not treat it as
    // a fatal runtime error. We swallow auth errors here and fall through to
    // the logged-out state; only unexpected failures get logged.
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          const msg = error.message || "";
          const benign = /refresh_token_not_found|Invalid Refresh Token|Auth session missing/i.test(msg);
          if (!benign) console.error("[AuthContext] getSession failed:", error);
          // Clear any stale local auth state so the SDK stops retrying.
          supabase.auth.signOut({ scope: "local" }).catch(() => {});
        }
        setSession(session ?? null);
        setUser(session?.user ?? null);
        if (session?.user) {
          loadProfileAndRoles(session.user.id, session.user.email);
          setTimeout(() => { redeemPendingInvite().catch(() => {}); }, 250);
        }
        setLoading(false);
      })
      .catch(() => {
        // Network/unknown — fail open as logged out.
        setSession(null);
        setUser(null);
        setLoading(false);
      });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Apply account accessibility preferences at the document root so every
  // route, dialog, and portal obeys the same setting. The cleanup also keeps
  // one user's preferences from leaking into the next signed-in session.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("crownme-reduce-motion", !!profile?.reduce_motion);
    root.classList.toggle("crownme-larger-text", !!profile?.larger_text);
    root.classList.toggle("crownme-high-contrast", !!profile?.high_contrast);
    return () => {
      root.classList.remove(
        "crownme-reduce-motion",
        "crownme-larger-text",
        "crownme-high-contrast",
      );
    };
  }, [profile?.reduce_motion, profile?.larger_text, profile?.high_contrast]);

  // Watch age_confirmed in realtime — if it flips, force re-verification.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`age-watch-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles_private", filter: `id=eq.${user.id}` },
        async (payload) => {
          const next = !!(payload.new as { age_confirmed?: boolean }).age_confirmed;
          setAgeConfirmed((prev) => {
            if (prev !== next) {
              import("@/lib/analytics").then(({ trackEvent }) => {
                trackEvent("age_reverify_required", { metadata: { newly: next } });
              });
            }
            return next;
          });
          // If a moderator/admin revoked the user's age confirmation,
          // immediately sign them out and bounce to /verify-age.
          if (!next) {
            try { await supabase.auth.signOut(); } catch { /* noop */ }
            try {
              const { toast } = await import("sonner");
              toast.error("Age verification required", {
                description: "You've been signed out because your age status needs to be re-confirmed.",
                duration: 10000,
                action: {
                  label: "Verify now",
                  onClick: () => {
                    if (typeof window !== "undefined") window.location.assign("/verify-age");
                  },
                },
              });
            } catch { /* noop */ }
            if (typeof window !== "undefined") {
              setTimeout(() => window.location.replace("/verify-age"), 1500);
            }
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsModerator(false);
    setIsAdmin(false);
    setAgeConfirmed(null);
  };

  const refreshProfile = async () => {
    if (user) await loadProfileAndRoles(user.id, user.email);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut, refreshProfile, isModerator, isAdmin, ageConfirmed, needsOnboarding, markOnboarded, onboardingStep, setOnboardingStep }}>
      {children}
    </AuthContext.Provider>
  );
}

const AUTH_FALLBACK: AuthContextValue = {
  user: null,
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  isModerator: false,
  isAdmin: false,
  ageConfirmed: null,
  needsOnboarding: false,
  markOnboarded: async () => {},
  onboardingStep: 0,
  setOnboardingStep: async () => {},
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  // Return a safe fallback instead of throwing — prevents blank screens during
  // Vite Fast Refresh when the context module re-evaluates and briefly leaves
  // consumers without a provider reference.
  return ctx ?? AUTH_FALLBACK;
}
