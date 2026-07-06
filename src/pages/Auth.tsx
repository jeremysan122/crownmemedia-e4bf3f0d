import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { Eye, EyeOff, Loader2, Check, X, Mail, AlertTriangle } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { calculateAge } from "@/lib/crown";
import { lovable } from "@/integrations/lovable";
import { trackEvent } from "@/lib/analytics";
import { scorePassword } from "@/lib/passwordStrength";
import { isReservedUsername } from "@/lib/reservedUsernames";
import { COUNTRIES } from "@/lib/countries";
import {
  validateStep1, validateStep2, firstErrorKey,
  STEP1_ORDER, STEP2_ORDER, type SignupErrors,
} from "@/lib/signupValidation";
import { cn } from "@/lib/utils";

const signupSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(8, "At least 8 characters").max(72),
  username: z.string().trim().min(3, "Min 3 chars").max(24).regex(/^[a-zA-Z0-9_.]+$/, "Letters, numbers, _ . only"),
  first_name: z.string().trim().min(1, "First name required").max(50),
  last_name: z.string().trim().min(1, "Last name required").max(50),
  gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"], {
    errorMap: () => ({ message: "Please select a gender" }),
  }),
  city: z.string().trim().min(1, "Required").max(80),
  state: z.string().trim().min(1, "Required").max(80),
  country: z.string().trim().min(1, "Required").max(80),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth"),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(72),
});

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "reserved" | "invalid";

function safeNextPath(raw: string | null): string {
  if (!raw) return "/feed";
  try {
    // Only allow same-origin relative paths starting with a single '/'
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/feed";
    // Round-trip through URL to reject anything weird
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return "/feed";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/feed";
  }
}

export default function Auth() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const nextPath = safeNextPath(params.get("next"));
  const nextQS = nextPath === "/feed" ? "" : `?next=${encodeURIComponent(nextPath)}`;
  const initialMode = params.get("mode") === "login" ? "login" : "signup";
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  useSeoMeta({
    title: mode === "login" ? "Sign In · CrownMe" : "Join CrownMe — The Social Crown Competition",
    description:
      mode === "login"
        ? "Sign in to CrownMe and defend your throne."
        : "Create your CrownMe account. Post photos, earn votes, and compete for the crown of your city.",
    noIndex: true, // auth page shouldn't be indexed
  });
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: "", password: "", confirmPassword: "", username: "",
    first_name: "", last_name: "", gender: "" as "" | "male" | "female" | "non_binary" | "prefer_not_to_say",
    city: "", state: "", country: "",
    dob: "",
    referral: "",
  });
  const [termsOk, setTermsOk] = useState(false);
  const [privacyOk, setPrivacyOk] = useState(false);
  const [communityOk, setCommunityOk] = useState(false);
  const policiesOk = termsOk && privacyOk && communityOk;
  const [marketingOk, setMarketingOk] = useState(true);
  const [rememberMe, setRememberMe] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [checkInbox, setCheckInbox] = useState<string | null>(null);
  const [magicSending, setMagicSending] = useState(false);
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [errors, setErrors] = useState<SignupErrors>({});
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const setFieldRef = (name: string) => (el: HTMLElement | null) => {
    fieldRefs.current[name] = el;
  };
  const focusFirstError = (errs: SignupErrors, step: 1 | 2) => {
    const key = firstErrorKey(errs, step === 1 ? STEP1_ORDER : STEP2_ORDER);
    if (!key) return;
    // requestAnimationFrame ensures the field exists (esp. after step switch)
    requestAnimationFrame(() => {
      const el = fieldRefs.current[key];
      if (el && typeof (el as HTMLElement).focus === "function") {
        (el as HTMLElement).focus({ preventScroll: false });
      }
    });
  };
  const clearFieldError = (field: keyof SignupErrors) => {
    setErrors((e) => {
      if (!e[field]) return e;
      const { [field]: _omit, ...rest } = e;
      return rest;
    });
  };
  const usernameTimer = useRef<number | null>(null);

  const pwScore = useMemo(() => scorePassword(form.password), [form.password]);
  const pwMatch = form.password.length > 0 && form.password === form.confirmPassword;

  // Persist remember-me email
  useEffect(() => {
    try {
      const remembered = localStorage.getItem("crownme_remember_email");
      if (remembered && !form.email) setForm((f) => ({ ...f, email: remembered }));
    } catch { /* noop */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Capture invite ref code from URL for later redemption after signup/signin
    const ref = params.get("ref");
    if (ref && ref.trim().length >= 4) {
      try { localStorage.setItem("crownme_invite_ref", ref.trim().toUpperCase()); } catch { /* noop */ }
      setForm((f) => f.referral ? f : { ...f, referral: ref.trim().toUpperCase() });
    }
    if (mode === "signup") {
      const ok = sessionStorage.getItem("crownme_age_confirmed");
      // If not confirmed we still let them through — DOB on the form will validate.
      void ok;
    }
  }, [mode, params]);

  // Username availability check (debounced)
  useEffect(() => {
    if (mode !== "signup") { setUsernameStatus("idle"); return; }
    const v = form.username.trim().toLowerCase();
    if (usernameTimer.current) window.clearTimeout(usernameTimer.current);
    if (!v) { setUsernameStatus("idle"); return; }
    if (!/^[a-z0-9_.]{3,24}$/.test(v)) { setUsernameStatus("invalid"); return; }
    if (isReservedUsername(v)) { setUsernameStatus("reserved"); return; }
    setUsernameStatus("checking");
    usernameTimer.current = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", v)
        .maybeSingle();
      if (error) { setUsernameStatus("idle"); return; }
      setUsernameStatus(data ? "taken" : "available");
    }, 400);
    return () => { if (usernameTimer.current) window.clearTimeout(usernameTimer.current); };
  }, [form.username, mode]);

  const onPwKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsOn(e.getModifierState && e.getModifierState("CapsLock"));
  };

  const tryRedeemPendingInvite = async () => {
    let code: string | null = null;
    try { code = localStorage.getItem("crownme_invite_ref"); } catch { /* noop */ }
    if (!code && form.referral) code = form.referral.trim().toUpperCase();
    if (!code) return;
    try {
      const { data, error } = await supabase.rpc("redeem_invite_code", { _code: code });
      try { localStorage.removeItem("crownme_invite_ref"); } catch { /* noop */ }
      if (error) return;
      const result = data as { ok?: boolean; already_redeemed?: boolean; shekels_awarded?: number };
      if (result?.already_redeemed) {
        toast.info("Invite code already redeemed on this account.");
      } else if (result?.ok) {
        const amt = result.shekels_awarded ?? 200;
        toast.success(`Invite reward unlocked — +${amt} shekels 👑`, {
          description: "Your inviter also got +200 shekels. If both of you activate Royal Pass, you each get +30 free days.",
          duration: 7000,
        });
      }
    } catch { /* ignore */ }
  };

  const persistRemember = () => {
    try {
      if (rememberMe) localStorage.setItem("crownme_remember_email", form.email.trim());
      else localStorage.removeItem("crownme_remember_email");
    } catch { /* noop */ }
  };

  const advanceToStep2 = () => {
    const errs = validateStep1({
      email: form.email,
      password: form.password,
      confirmPassword: form.confirmPassword,
      username: form.username,
      passwordScore: pwScore.score,
      usernameStatus,
    });
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      focusFirstError(errs, 1);
      return;
    }
    setSignupStep(2);
    // Reset scroll & focus to first step-2 field for a clean transition.
    requestAnimationFrame(() => {
      fieldRefs.current["first_name"]?.focus();
    });
  };

  const handle = async () => {
    setLoading(true);
    setUnverifiedEmail(null);
    try {
      if (mode === "signup") {
        const step1Errs = validateStep1({
          email: form.email, password: form.password, confirmPassword: form.confirmPassword,
          username: form.username, passwordScore: pwScore.score, usernameStatus,
        });
        const step2Errs = validateStep2({
          first_name: form.first_name, last_name: form.last_name, dob: form.dob,
          gender: form.gender, country: form.country, state: form.state, city: form.city,
          policiesOk,
        });
        const allErrs: SignupErrors = { ...step1Errs, ...step2Errs };
        setErrors(allErrs);
        if (Object.keys(step1Errs).length > 0) {
          setSignupStep(1);
          focusFirstError(step1Errs, 1);
          return;
        }
        if (Object.keys(step2Errs).length > 0) {
          if (step2Errs.dob && /18 or older/i.test(step2Errs.dob)) {
            trackEvent("age_gate_blocked_underage", { metadata: { source: "auth_signup" } });
          }
          focusFirstError(step2Errs, 2);
          return;
        }
        const parsed = signupSchema.safeParse(form);
        if (!parsed.success) {
          // Shouldn't happen — validators are stricter than the schema — but guard.
          toast.error(parsed.error.errors[0].message);
          return;
        }
        try { sessionStorage.setItem("crownme_age_confirmed", "true"); sessionStorage.setItem("crownme_dob", parsed.data.dob); } catch { /* noop */ }
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/feed`,
            data: {
              username: parsed.data.username,
              first_name: parsed.data.first_name,
              last_name: parsed.data.last_name,
              gender: parsed.data.gender,
              dob: parsed.data.dob,
              city: parsed.data.city,
              state: parsed.data.state,
              country: parsed.data.country,
              policies_accepted: true,
              marketing_opt_in: marketingOk,
            },
          },
        });
        if (error) {
          if (/18 or older/i.test(error.message)) {
            trackEvent("age_gate_blocked_underage", { metadata: { source: "auth_signup_server" } });
          } else if (/agree to the Terms/i.test(error.message)) {
            const { logRawError } = await import("@/lib/settingsSecurityErrors");
            logRawError(error, "signup");
            toast.error("You must agree to the Terms and Community Guidelines.");
            return;
          }
          const { toFriendlyMessage, logRawError } = await import("@/lib/settingsSecurityErrors");
          logRawError(error, "signup");
          toast.error(toFriendlyMessage(error, "signup"));
          return;
        }
        persistRemember();
        if (data.user) {
          try {
            const { recordAcceptances } = await import("@/lib/legalAcceptance");
            await recordAcceptances(data.user.id, ["terms", "privacy", "community", "csae"], "signup");
          } catch { /* non-fatal; consent gate will re-prompt */ }
        }
        if (data.session) {
          await tryRedeemPendingInvite();
          toast.success("Welcome to CrownMe");
          nav("/feed", { replace: true });
        } else {
          setCheckInbox(parsed.data.email);
        }
      } else {
        const parsed = loginSchema.safeParse({ email: form.email, password: form.password });
        if (!parsed.success) {
          toast.error(parsed.error.errors[0].message);
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) {
          if (/email.*not.*confirmed|not.*verified/i.test(error.message)) {
            setUnverifiedEmail(parsed.data.email);
          }
          const { toFriendlyMessage, logRawError } = await import("@/lib/settingsSecurityErrors");
          logRawError(error, "login");
          toast.error(toFriendlyMessage(error, "login"));
          return;
        }
        persistRemember();
        await tryRedeemPendingInvite();
        toast.success("Welcome back");
        nav("/feed", { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const sendMagicLink = async () => {
    const email = form.email.trim();
    if (!email || !/^.+@.+\..+$/.test(email)) {
      toast.error("Enter your email first");
      return;
    }
    setMagicSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/feed`, shouldCreateUser: false },
      });
      if (error) {
        const { toFriendlyMessage, logRawError } = await import("@/lib/settingsSecurityErrors");
        logRawError(error, "login");
        toast.error(toFriendlyMessage(error, "login"));
        return;
      }
      // Neutral copy avoids email enumeration.
      toast.success("If an account exists, we sent a sign-in link.");
    } finally {
      setMagicSending(false);
    }
  };

  const resendVerification = async () => {
    const email = unverifiedEmail || form.email.trim();
    if (!email) return;
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) {
      const { toFriendlyMessage, logRawError } = await import("@/lib/settingsSecurityErrors");
      logRawError(error, "signup");
      toast.error(toFriendlyMessage(error, "signup"));
    } else {
      toast.success("Verification email resent");
    }
  };

  // ============ Check inbox state ============
  if (checkInbox) {
    return (
      <div className="min-h-screen flex flex-col px-6 py-10 bg-gradient-royal">
        <Link to="/" className="flex flex-col items-center gap-2 mb-6 mx-auto" aria-label="CrownMe home">
          <BrandLogo size={88} priority />
        </Link>
        <div className="flex-1 max-w-sm w-full mx-auto animate-fade-in text-center">
          <div className="size-16 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center mx-auto mb-5">
            <Mail className="size-7 text-gold" />
          </div>
          <h1 className="font-display text-2xl text-gold mb-2">Check your inbox</h1>
          <p className="text-sm text-muted-foreground mb-6">
            We sent a verification link to <span className="text-foreground font-semibold">{checkInbox}</span>.
            Tap it to claim your throne.
          </p>
          <Button onClick={resendVerification} variant="outline" className="w-full h-12 mb-2">
            Resend verification email
          </Button>
          <Button
            onClick={() => { setCheckInbox(null); setMode("login"); }}
            className="w-full h-12 bg-gradient-gold text-primary-foreground font-bold tracking-wider gold-shadow"
          >
            Back to log in
          </Button>
          <button
            type="button"
            onClick={() => setCheckInbox(null)}
            className="w-full text-xs text-muted-foreground hover:text-primary mt-4"
          >
            Wrong email? Edit your details
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] flex flex-col px-5 py-4 sm:py-6 bg-gradient-royal">
      <Link to="/" className="flex flex-col items-center mb-2 mx-auto" aria-label="CrownMe home">
        <BrandLogo size={56} priority />
      </Link>

      <div className="flex-1 max-w-sm w-full mx-auto animate-fade-in">
        <div className="mb-3">
          <h1 className="font-display text-xl sm:text-2xl text-gold leading-tight">
            {mode === "signup" ? (signupStep === 1 ? "Claim your throne" : "Almost there") : "Welcome back"}
          </h1>
          <p className="text-[11px] sm:text-xs text-muted-foreground">
            {mode === "signup"
              ? (signupStep === 1 ? "Step 1 of 2 — your account" : "Step 2 of 2 — your profile")
              : "Continue your reign"}
          </p>
        </div>

        {mode === "signup" && (
          <nav aria-label="Signup progress" className="mb-4">
            <ol className="flex items-center gap-2">
              {([
                { n: 1 as const, label: "Account" },
                { n: 2 as const, label: "Profile" },
              ]).map((s, i) => {
                const done = signupStep > s.n;
                const active = signupStep === s.n;
                return (
                  <li key={s.n} className="flex items-center gap-2 flex-1">
                    <div
                      aria-current={active ? "step" : undefined}
                      className={cn(
                        "flex items-center gap-2 transition-all duration-300",
                        active ? "opacity-100" : done ? "opacity-90" : "opacity-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex items-center justify-center size-6 rounded-full text-[11px] font-bold border transition-all duration-300",
                          active
                            ? "bg-gradient-gold text-primary-foreground border-gold gold-shadow scale-110"
                            : done
                              ? "bg-gold/20 text-gold border-gold/60"
                              : "bg-muted/40 text-muted-foreground border-border",
                        )}
                      >
                        {done ? <Check className="size-3.5" aria-hidden /> : s.n}
                      </span>
                      <span
                        className={cn(
                          "text-[11px] font-semibold tracking-wide uppercase",
                          active ? "text-gold" : done ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {s.label}
                      </span>
                    </div>
                    {i === 0 && (
                      <span className="flex-1 h-px bg-border relative overflow-hidden" aria-hidden>
                        <span
                          className={cn(
                            "absolute inset-y-0 left-0 bg-gradient-gold transition-all duration-500",
                            signupStep >= 2 ? "w-full" : "w-0",
                          )}
                        />
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        <form
          className="space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (loading) return;
            if (mode === "signup" && signupStep === 1) { advanceToStep2(); return; }
            handle();
          }}
        >
          <div className={mode === "signup" && signupStep === 2 ? "hidden" : ""}>

            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              ref={setFieldRef("email")}
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => { setForm({ ...form, email: e.target.value }); clearFieldError("email"); }}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "auth-email-err" : undefined}
              className={cn("h-11 bg-input", errors.email && "border-destructive focus-visible:ring-destructive")}
              placeholder="you@royal.com"
            />
            {errors.email && (
              <p id="auth-email-err" role="alert" className="text-[11px] text-destructive mt-1">{errors.email}</p>
            )}
          </div>

          <div className={mode === "signup" && signupStep === 2 ? "hidden" : ""}>

            <div className="flex items-center justify-between">
              <Label htmlFor="auth-password">Password</Label>
              {mode === "login" && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={async () => {
                    const email = form.email.trim();
                    if (!email) {
                      toast.error("Enter your email above first");
                      return;
                    }
                    const { error } = await supabase.auth.resetPasswordForEmail(email, {
                      redirectTo: `${window.location.origin}/reset-password`,
                    });
                    if (error) {
                      const { logRawError } = await import("@/lib/settingsSecurityErrors");
                      logRawError(error, "auth");
                    }
                    // Always show a neutral message to avoid email enumeration.
                    toast.success("If that email is registered, a reset link is on the way.");
                  }}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <Input
                id="auth-password"
                ref={setFieldRef("password")}
                name="password"
                type={showPw ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={form.password}
                onChange={(e) => { setForm({ ...form, password: e.target.value }); clearFieldError("password"); }}
                onKeyDown={onPwKey}
                onKeyUp={onPwKey}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "auth-password-err" : undefined}
                className={cn("h-11 bg-input pr-11", errors.password && "border-destructive focus-visible:ring-destructive")}
                placeholder="••••••••"
              />
              <button
                type="button"
                aria-label={showPw ? "Hide password" : "Show password"}
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.password && (
              <p id="auth-password-err" role="alert" className="text-[11px] text-destructive mt-1">{errors.password}</p>
            )}
            {capsOn && (
              <p className="text-[11px] text-orange-400 mt-1 flex items-center gap-1">
                <AlertTriangle className="size-3" /> Caps Lock is on
              </p>
            )}
            {mode === "signup" && form.password.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${i <= pwScore.score ? pwScore.color : "bg-muted"}`}
                    />
                  ))}
                </div>
                <p className="text-[11px] mt-1 text-muted-foreground">
                  <span className="text-foreground font-semibold">{pwScore.label}</span>
                  {pwScore.hints.length > 0 && pwScore.score < 3 && (
                    <> — add {pwScore.hints.slice(0, 2).join(", ")}</>
                  )}
                </p>
              </div>
            )}
          </div>

          {mode === "signup" && (
            <div className={signupStep === 2 ? "hidden" : ""}>
              <Label htmlFor="auth-confirm">Confirm password</Label>
              <div className="relative">
                <Input
                  id="auth-confirm"
                  ref={setFieldRef("confirmPassword")}
                  name="confirmPassword"
                  type={showConfirmPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(e) => { setForm({ ...form, confirmPassword: e.target.value }); clearFieldError("confirmPassword"); }}
                  aria-invalid={!!errors.confirmPassword}
                  aria-describedby={errors.confirmPassword ? "auth-confirm-err" : undefined}
                  className={cn("h-11 bg-input pr-11", errors.confirmPassword && "border-destructive focus-visible:ring-destructive")}
                  placeholder="Repeat password"
                />
                <button
                  type="button"
                  aria-label={showConfirmPw ? "Hide password" : "Show password"}
                  onClick={() => setShowConfirmPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.confirmPassword ? (
                <p id="auth-confirm-err" role="alert" className="text-[11px] text-destructive mt-1">{errors.confirmPassword}</p>
              ) : form.confirmPassword.length > 0 && (
                <p className={`text-[11px] mt-1 flex items-center gap-1 ${pwMatch ? "text-emerald-400" : "text-destructive"}`}>
                  {pwMatch ? <Check className="size-3" /> : <X className="size-3" />}
                  {pwMatch ? "Passwords match" : "Passwords don't match"}
                </p>
              )}
            </div>
          )}


          {mode === "signup" && (
            <div className={signupStep === 2 ? "hidden" : ""}>
              <Label htmlFor="auth-username">Username</Label>
              <div className="relative">
                <Input
                  id="auth-username"
                  ref={setFieldRef("username")}
                  name="username"
                  value={form.username}
                  onChange={(e) => { setForm({ ...form, username: e.target.value.toLowerCase() }); clearFieldError("username"); }}
                  aria-invalid={!!errors.username || usernameStatus === "taken" || usernameStatus === "reserved" || usernameStatus === "invalid"}
                  aria-describedby={errors.username ? "auth-username-err" : undefined}
                  className={cn("h-11 bg-input pr-10", (errors.username || usernameStatus === "taken" || usernameStatus === "reserved" || usernameStatus === "invalid") && "border-destructive focus-visible:ring-destructive")}
                  placeholder="kingname"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === "checking" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                  {usernameStatus === "available" && <Check className="size-4 text-emerald-400" />}
                  {(usernameStatus === "taken" || usernameStatus === "reserved" || usernameStatus === "invalid") && <X className="size-4 text-destructive" />}
                </div>
              </div>
              {errors.username ? (
                <p id="auth-username-err" role="alert" className="text-[11px] text-destructive mt-1">{errors.username}</p>
              ) : (
                <>
                  {usernameStatus === "taken" && <p className="text-[11px] text-destructive mt-1">That username is taken</p>}
                  {usernameStatus === "reserved" && <p className="text-[11px] text-destructive mt-1">That username is reserved</p>}
                  {usernameStatus === "invalid" && <p className="text-[11px] text-destructive mt-1">3–24 chars · letters, numbers, _ .</p>}
                  {usernameStatus === "available" && <p className="text-[11px] text-emerald-400 mt-1">Available 👑</p>}
                </>
              )}
            </div>
          )}

          {mode === "signup" && (
            <div
              key={`step2-${signupStep}`}
              className={signupStep === 1 ? "hidden" : "space-y-2.5 animate-fade-in"}
            >
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <Label htmlFor="auth-first-name">First name</Label>
                  <Input
                    id="auth-first-name"
                    ref={setFieldRef("first_name")}
                    name="first_name"
                    value={form.first_name}
                    onChange={(e) => { setForm({ ...form, first_name: e.target.value }); clearFieldError("first_name"); }}
                    aria-invalid={!!errors.first_name}
                    aria-describedby={errors.first_name ? "auth-first-name-err" : undefined}
                    className={cn("h-11 bg-input", errors.first_name && "border-destructive focus-visible:ring-destructive")}
                    placeholder="Jane"
                    autoComplete="given-name"
                  />
                  {errors.first_name && <p id="auth-first-name-err" role="alert" className="text-[11px] text-destructive mt-1">{errors.first_name}</p>}
                </div>
                <div>
                  <Label htmlFor="auth-last-name">Last name</Label>
                  <Input
                    id="auth-last-name"
                    ref={setFieldRef("last_name")}
                    name="last_name"
                    value={form.last_name}
                    onChange={(e) => { setForm({ ...form, last_name: e.target.value }); clearFieldError("last_name"); }}
                    aria-invalid={!!errors.last_name}
                    aria-describedby={errors.last_name ? "auth-last-name-err" : undefined}
                    className={cn("h-11 bg-input", errors.last_name && "border-destructive focus-visible:ring-destructive")}
                    placeholder="Doe"
                    autoComplete="family-name"
                  />
                  {errors.last_name && <p id="auth-last-name-err" role="alert" className="text-[11px] text-destructive mt-1">{errors.last_name}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <Label htmlFor="auth-dob">Date of birth</Label>
                  <Input
                    id="auth-dob"
                    ref={setFieldRef("dob")}
                    name="dob"
                    type="date"
                    value={form.dob}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => { setForm({ ...form, dob: e.target.value }); clearFieldError("dob"); }}
                    aria-invalid={!!errors.dob}
                    aria-describedby={errors.dob ? "auth-dob-err" : undefined}
                    className={cn("h-11 bg-input", errors.dob && "border-destructive focus-visible:ring-destructive")}
                  />
                  {errors.dob && <p id="auth-dob-err" role="alert" className="text-[11px] text-destructive mt-1">{errors.dob}</p>}
                </div>
                <div>
                  <Label htmlFor="auth-gender">Gender</Label>
                  <select
                    id="auth-gender"
                    ref={setFieldRef("gender")}
                    name="gender"
                    value={form.gender}
                    onChange={(e) => { setForm({ ...form, gender: e.target.value as typeof form.gender }); clearFieldError("gender"); }}
                    aria-invalid={!!errors.gender}
                    aria-describedby={errors.gender ? "auth-gender-err" : undefined}
                    className={cn("h-11 w-full rounded-md bg-input border border-input px-3 text-sm", errors.gender && "border-destructive")}
                  >
                    <option value="">Select…</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="non_binary">Non-binary</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                  {errors.gender && <p id="auth-gender-err" role="alert" className="text-[11px] text-destructive mt-1">{errors.gender}</p>}
                </div>
              </div>

              <div>
                <Label htmlFor="auth-country">Country</Label>
                <select
                  id="auth-country"
                  ref={setFieldRef("country")}
                  name="country"
                  value={form.country}
                  onChange={(e) => { setForm({ ...form, country: e.target.value }); clearFieldError("country"); }}
                  aria-invalid={!!errors.country}
                  aria-describedby={errors.country ? "auth-country-err" : undefined}
                  className={cn("h-11 w-full rounded-md bg-input border border-input px-3 text-sm", errors.country && "border-destructive")}
                >
                  <option value="">Select country…</option>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {errors.country && <p id="auth-country-err" role="alert" className="text-[11px] text-destructive mt-1">{errors.country}</p>}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <Label htmlFor="auth-state">State / Region</Label>
                  <Input
                    id="auth-state"
                    ref={setFieldRef("state")}
                    name="state"
                    autoComplete="address-level1"
                    value={form.state}
                    onChange={(e) => { setForm({ ...form, state: e.target.value }); clearFieldError("state"); }}
                    aria-invalid={!!errors.state}
                    aria-describedby={errors.state ? "auth-state-err" : undefined}
                    className={cn("h-11 bg-input", errors.state && "border-destructive focus-visible:ring-destructive")}
                    placeholder="Georgia"
                  />
                  {errors.state && <p id="auth-state-err" role="alert" className="text-[11px] text-destructive mt-1">{errors.state}</p>}
                </div>
                <div>
                  <Label htmlFor="auth-city">City</Label>
                  <Input
                    id="auth-city"
                    ref={setFieldRef("city")}
                    name="city"
                    autoComplete="address-level2"
                    value={form.city}
                    onChange={(e) => { setForm({ ...form, city: e.target.value }); clearFieldError("city"); }}
                    aria-invalid={!!errors.city}
                    aria-describedby={errors.city ? "auth-city-err" : undefined}
                    className={cn("h-11 bg-input", errors.city && "border-destructive focus-visible:ring-destructive")}
                    placeholder="Atlanta"
                  />
                  {errors.city && <p id="auth-city-err" role="alert" className="text-[11px] text-destructive mt-1">{errors.city}</p>}
                </div>
              </div>

              <div>
                <Label htmlFor="auth-referral">Invite code <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="auth-referral"
                  name="referral"
                  value={form.referral}
                  onChange={(e) => setForm({ ...form, referral: e.target.value.toUpperCase() })}
                  className="h-11 bg-input"
                  placeholder="CROWN2026"
                />
              </div>

              <label className={cn("flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/40 cursor-pointer", errors.policies && "ring-1 ring-destructive")}>
                <Checkbox
                  ref={setFieldRef("policies")}
                  checked={policiesOk}
                  onCheckedChange={(v) => { const ok = !!v; setTermsOk(ok); setPrivacyOk(ok); setCommunityOk(ok); if (ok) clearFieldError("policies"); }}
                  aria-invalid={!!errors.policies}
                  aria-describedby={errors.policies ? "auth-policies-err" : undefined}
                  className="mt-0.5"
                />
                <span className="text-[11px] leading-snug text-muted-foreground">
                  I'm 18+ and agree to the{" "}
                  <Link to="/terms" target="_blank" className="underline text-primary">Terms</Link>,{" "}
                  <Link to="/privacy" target="_blank" className="underline text-primary">Privacy Policy</Link>,{" "}
                  <Link to="/acceptable-use" target="_blank" className="underline text-primary">Community Guidelines</Link>, and{" "}
                  <Link to="/csae-policy" target="_blank" className="underline text-primary">zero-tolerance CSAE policy</Link>.
                </span>
              </label>
              {errors.policies && (
                <p id="auth-policies-err" role="alert" className="text-[11px] text-destructive -mt-1 px-1">{errors.policies}</p>
              )}
              <label className="flex items-start gap-2.5 px-2.5 cursor-pointer">
                <Checkbox checked={marketingOk} onCheckedChange={(v) => setMarketingOk(!!v)} className="mt-0.5" />
                <span className="text-[11px] leading-snug text-muted-foreground">
                  Send me royal updates — drops & contests. Unsubscribe anytime.
                </span>
              </label>
            </div>
          )}

          {mode === "login" && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={rememberMe} onCheckedChange={(v) => setRememberMe(!!v)} />
              Remember my email on this device
            </label>
          )}


          {mode === "signup" && signupStep === 2 ? (
            <div className="flex gap-2 mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSignupStep(1)}
                className="h-12 px-4 border-border"
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={loading || !policiesOk}
                className="flex-1 h-12 bg-gradient-gold text-primary-foreground font-bold tracking-wider gold-shadow"
              >
                {loading ? <Loader2 className="size-5 animate-spin" /> : "CREATE ACCOUNT"}
              </Button>
            </div>
          ) : (
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 mt-3 bg-gradient-gold text-primary-foreground font-bold tracking-wider gold-shadow"
            >
              {loading ? <Loader2 className="size-5 animate-spin" /> : mode === "signup" ? "CONTINUE" : "LOG IN"}
            </Button>
          )}

          {unverifiedEmail && mode === "login" && (
            <div className="mt-2 p-3 rounded-lg border border-gold/30 bg-gold/5 text-xs text-foreground flex items-center justify-between gap-2">
              <span>Email not verified yet.</span>
              <button type="button" onClick={resendVerification} className="text-gold font-semibold hover:underline">
                Resend link
              </button>
            </div>
          )}

          <div className={`relative my-3 ${mode === "signup" && signupStep === 2 ? "hidden" : ""}`}>
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>


          {mode === "login" && (
            <Button
              type="button"
              variant="outline"
              disabled={magicSending}
              onClick={sendMagicLink}
              className="w-full h-12 bg-card hover:bg-card/80 border-border text-foreground font-medium"
            >
              {magicSending ? <Loader2 className="size-5 animate-spin" /> : (<><Mail className="size-4 mr-2" /> Email me a magic link</>)}
            </Button>
          )}

          {!(mode === "signup" && signupStep === 2) && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const result = await lovable.auth.signInWithOAuth("google", {
                      redirect_uri: window.location.origin,
                    });
                    if (result.error) {
                      toast.error("Google sign-in failed");
                      return;
                    }
                    if (result.redirected) return;
                    nav("/feed", { replace: true });
                  } catch (e) {
                    toast.error("Google sign-in failed");
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full h-11 bg-card hover:bg-card/80 border-border text-foreground font-medium"
              >
                <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C17 3.3 14.7 2.3 12 2.3 6.9 2.3 2.8 6.4 2.8 11.5S6.9 20.7 12 20.7c6.9 0 9.5-4.8 9.5-7.4 0-.5-.06-.9-.13-1.3H12z"/>
                </svg>
                Continue with Google
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const result = await lovable.auth.signInWithOAuth("apple", {
                      redirect_uri: window.location.origin,
                    });
                    if (result.error) {
                      toast.error("Apple sign-in failed");
                      return;
                    }
                    if (result.redirected) return;
                    nav("/feed", { replace: true });
                  } catch (e) {
                    toast.error("Apple sign-in failed");
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full h-11 mt-2 bg-foreground hover:bg-foreground/90 text-background border-foreground font-medium"
              >
                <svg className="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.05 12.04c-.03-2.86 2.34-4.24 2.45-4.31-1.34-1.96-3.42-2.23-4.16-2.26-1.77-.18-3.46 1.04-4.36 1.04-.91 0-2.3-1.02-3.78-.99-1.94.03-3.74 1.13-4.74 2.86-2.02 3.5-.52 8.68 1.45 11.52.96 1.39 2.1 2.95 3.58 2.9 1.44-.06 1.99-.93 3.73-.93 1.74 0 2.23.93 3.75.9 1.55-.03 2.53-1.42 3.48-2.82 1.1-1.62 1.55-3.19 1.57-3.27-.03-.01-3.01-1.16-3.04-4.6zM14.18 3.62c.79-.96 1.33-2.29 1.18-3.62-1.14.05-2.53.76-3.35 1.71-.73.84-1.38 2.2-1.21 3.5 1.28.1 2.58-.65 3.38-1.59z"/>
                </svg>
                Continue with Apple
              </Button>

              <button
                type="button"
                onClick={() => {
                  setUnverifiedEmail(null);
                  setSignupStep(1);
                  if (mode === "signup") setMode("login");
                  else setMode("signup");
                }}
                className="w-full text-sm text-muted-foreground hover:text-primary mt-3"
              >
                {mode === "signup" ? "Already have an account? Log in" : "Need an account? Sign up"}
              </button>
            </>
          )}

        </form>
      </div>
    </div>
  );
}
