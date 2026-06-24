import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ShieldCheck, Crown, Upload, Loader2, ArrowLeft, CheckCircle2, Lock, Clock, FileText, Eye, MessageCircle, Sparkles, Circle } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { Link, useNavigate } from "react-router-dom";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import {
  fetchEligibilityProgress,
  requestStandardVerification,
  orderedChecks,
  checkFraction,
  passedCount,
  type EligibilityProgress,
} from "@/lib/verificationEligibility";

type Plan = "standard" | "subscription";
type Category = "creator" | "brand" | "public_figure" | "business" | "journalist";

interface Request {
  id: string;
  status: string;
  plan: Plan;
  category: string;
  reason: string;
  review_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const CATEGORY_LABEL: Record<Category, string> = {
  creator: "Creator / Influencer",
  brand: "Brand",
  public_figure: "Public Figure",
  business: "Business",
  journalist: "Journalist / Media",
};

async function uploadDoc(userId: string, file: File, kind: string): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("verification-docs")
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (error) throw error;
  return path;
}

export default function Verification() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const profilePath = profile?.username ? `/${profile.username}` : "/me";
  const { openCheckout: openVerificationCheckout, checkoutElement: verificationCheckoutEl } = useStripeCheckout();
  const goBack = () => {
    // Only use history.back() if we actually came from within the app —
    // otherwise (direct link / new tab) fall back to a safe destination.
    const sameOriginRef = typeof document !== "undefined"
      && document.referrer
      && new URL(document.referrer).origin === window.location.origin;
    if (sameOriginRef && window.history.length > 1) navigate(-1);
    else navigate("/settings");
  };
  const [plan, setPlan] = useState<Plan>("subscription");
  const [legalName, setLegalName] = useState("");
  const [category, setCategory] = useState<Category>("creator");
  const [brandName, setBrandName] = useState("");
  const [website, setWebsite] = useState("");
  const [followerCount, setFollowerCount] = useState<string>("");
  const [reason, setReason] = useState("");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [bizFile, setBizFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [request, setRequest] = useState<Request | null>(null);
  const [verified, setVerified] = useState(false);

  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [verificationCategory, setVerificationCategory] = useState<string | null>(null);
  const [verificationPlan, setVerificationPlan] = useState<Plan | null>(null);
  // Standard auto-eligibility progress — fetched lazily when the user picks
  // the free path so we don't waste a round-trip for paid-only users.
  const [progress, setProgress] = useState<EligibilityProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [claimingStandard, setClaimingStandard] = useState(false);

  const refreshProgress = useCallback(async () => {
    if (!user) return;
    setProgressLoading(true);
    try {
      const p = await fetchEligibilityProgress(user.id);
      setProgress(p);
    } catch (e: any) {
      console.warn("verification eligibility fetch failed", e);
    } finally {
      setProgressLoading(false);
    }
  }, [user]);

  // Fetch the progress doc whenever the user lands on the Standard path so
  // the checklist always reflects current follower / posts counts.
  useEffect(() => {
    if (plan === "standard" && user && !progress && !progressLoading) {
      void refreshProgress();
    }
  }, [plan, user, progress, progressLoading, refreshProgress]);

  const claimStandard = async () => {
    if (!user) return;
    setClaimingStandard(true);
    try {
      const res = await requestStandardVerification();
      if (res.status === "approved") {
        toast.success("You're verified! The blue checkmark is live across CrownMe.");
        setVerified(true);
        setVerifiedAt(new Date().toISOString());
        setVerificationPlan("standard");
      } else if (res.status === "already_verified") {
        toast.info("You're already verified.");
        setVerified(true);
      } else {
        setProgress(res.progress);
        toast.error("Not yet eligible — keep building toward each requirement below.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not submit verification");
    } finally {
      setClaimingStandard(false);
    }
  };


  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: prof }, { data: req }] = await Promise.all([
        supabase.from("profiles").select("verified, verified_at, username").eq("id", user.id).maybeSingle(),
        supabase.from("verification_requests").select("*").eq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setVerified(!!prof?.verified);
      setVerifiedAt((prof as any)?.verified_at ?? null);
      setRequest(req as Request | null);
      if (req) {
        setVerificationCategory((req as Request).category);
        setVerificationPlan((req as Request).plan);
      }
    })();
  }, [user]);


  const submit = async () => {
    if (!user) return;
    if (!idFile || !selfieFile) {
      toast.error("Please upload your ID and a live selfie");
      return;
    }
    if ((category === "brand" || category === "business") && !bizFile) {
      toast.error("Brands/businesses must upload business documentation");
      return;
    }
    setSubmitting(true);
    try {
      const id_path = await uploadDoc(user.id, idFile, "id");
      const selfie_path = await uploadDoc(user.id, selfieFile, "selfie");
      const biz_path = bizFile ? await uploadDoc(user.id, bizFile, "business") : null;

      const { data, error } = await supabase.rpc("submit_verification_request", {
        _plan: plan,
        _legal_name: legalName.trim(),
        _category: category,
        _brand_name: brandName.trim() || null,
        _website_url: website.trim() || null,
        _social_links: [],
        _follower_count: followerCount ? Number(followerCount) : null,
        _reason: reason.trim(),
        _id_document_path: id_path,
        _business_document_path: biz_path,
        _selfie_path: selfie_path,
      });
      if (error) throw error;
      toast.success("Verification submitted — we'll review in 3–7 days");
      const { data: req } = await supabase.from("verification_requests")
        .select("*").eq("id", data as string).maybeSingle();
      setRequest(req as Request);
    } catch (e: any) {
      toast.error(e.message ?? "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return <div className="p-6 text-center">Please log in to request verification.</div>;
  }

  if (verified) {
    const planLabel = verificationPlan === "subscription"
      ? "Subscription ($1.99/mo)"
      : verificationPlan === "standard"
      ? "Standard (free notability)"
      : "Standard";
    const categoryLabel = verificationCategory
      ? CATEGORY_LABEL[verificationCategory as Category] ?? verificationCategory
      : "—";
    const verifiedDate = verifiedAt ? new Date(verifiedAt).toLocaleDateString() : "—";

    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6 space-y-5">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>

        {/* Hero */}
        <Card className="p-6 text-center space-y-3 bg-gradient-to-b from-primary/10 to-transparent border-primary/30">
          <VerifiedBadge size={48} className="mx-auto" />
          <h1 className="text-2xl font-serif font-bold">You're verified</h1>
          <p className="text-muted-foreground text-sm">
            Your profile displays the blue checkmark next to your username everywhere on CrownMe.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <Badge variant="secondary" className="bg-primary/15 text-primary">Active</Badge>
            <Badge variant="outline">{planLabel}</Badge>
          </div>
        </Card>

        {/* Status details */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide">Verification details</h2>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground uppercase tracking-wide">Status</dt>
              <dd className="font-medium mt-0.5">Verified</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase tracking-wide">Plan</dt>
              <dd className="font-medium mt-0.5">{planLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase tracking-wide">Category</dt>
              <dd className="font-medium mt-0.5">{categoryLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground uppercase tracking-wide">Verified on</dt>
              <dd className="font-medium mt-0.5">{verifiedDate}</dd>
            </div>
          </dl>
        </Card>

        {/* Subscription management — only if paid plan */}
        {verificationPlan === "subscription" && (
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">Manage subscription</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Update your payment method, view receipts, or cancel anytime. Your badge stays active until the end of the current billing period.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const { data, error } = await supabase.functions.invoke("royal-pass-portal", { body: { return_path: "/verification" } });
                    if (error) throw error;
                    const url = (data as any)?.url;
                    if (!url) throw new Error("Could not open the billing portal");
                    window.location.href = url;
                  } catch (e: any) {
                    toast.error(e?.message ?? "Could not open billing portal");
                  }
                }}
              >
                Open billing portal
              </Button>
            </div>
          </Card>
        )}

        {/* Actions */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide">Manage your verification</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <Button asChild variant="outline" className="justify-start">
              <Link to={profilePath}><Eye className="h-4 w-4 mr-2" /> View your profile</Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link to="/edit-profile"><Upload className="h-4 w-4 mr-2" /> Update profile info</Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link to="/legal/community-guidelines"><ShieldCheck className="h-4 w-4 mr-2" /> Verification rules</Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <a href="mailto:support@crownmemedia.com?subject=Verification%20support"><MessageCircle className="h-4 w-4 mr-2" /> Contact support</a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            Need to re-submit documents or appeal a status change? Email{" "}
            <a className="text-primary hover:underline" href="mailto:support@crownmemedia.com">support@crownmemedia.com</a> — we respond within 3 business days.
          </p>
        </Card>

        {/* Badge preview */}
        <Card className="p-5 space-y-3 bg-muted/30">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide">Badge preview</h2>
          </div>
          <div className="flex items-center gap-2 text-base">
            <span className="font-semibold">@{(user as any)?.user_metadata?.username ?? "you"}</span>
            <VerifiedBadge size={16} />
          </div>
          <p className="text-xs text-muted-foreground">This is exactly how your name will appear across the app.</p>
        </Card>
      </div>
    );
  }


  if (request && (request.status === "pending" || request.status === "more_info_required")) {
    return (
      <div className="mx-auto max-w-2xl p-6 space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <Card className="p-6 space-y-3">
          <Badge variant={request.status === "pending" ? "secondary" : "destructive"}>
            {request.status === "pending" ? "Under review" : "More info required"}
          </Badge>
          <h1 className="text-xl font-serif font-bold">Verification {request.status === "pending" ? "in review" : "needs more info"}</h1>
          <p className="text-sm text-muted-foreground">Submitted {new Date(request.created_at).toLocaleDateString()}</p>
          {request.review_notes && (
            <div className="text-sm bg-muted/50 p-3 rounded">
              <span className="font-medium">Reviewer note:</span> {request.review_notes}
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-serif font-bold">Get Verified</h1>
        </div>
        <p className="text-muted-foreground">
          The blue checkmark is a public mark of authenticity on CrownMe. It tells the community
          that this account represents the real person, brand, or organization it claims to be.
        </p>
      </header>

      {/* Eligibility */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Eligibility</h2>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1.5">
          <li>• Account must be <span className="text-foreground">authentic</span> — represents a real person, brand, or registered business.</li>
          <li>• Account must be <span className="text-foreground">unique</span> — only one verified account per person or entity (language-specific accounts excepted).</li>
          <li>• Account must be <span className="text-foreground">complete</span> — public profile, bio, profile photo, and recent activity.</li>
          <li>• Account must be <span className="text-foreground">active on CrownMe</span> — at least 10,000 CrownMe followers plus the activity requirements in the progress card above (battles won, crowns held, votes received, posts published).</li>
          <li>• Account must follow the <Link to="/legal/community-guidelines" className="text-primary hover:underline">Community Guidelines</Link> and <Link to="/legal/terms" className="text-primary hover:underline">Terms of Service</Link>.</li>
        </ul>
      </Card>

      {/* How it works */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">How it works</h2>
        </div>
        <ol className="text-sm text-muted-foreground space-y-2">
          <li className="flex gap-3"><span className="text-primary font-bold">1.</span> Choose your plan and submit your details, ID, and a live selfie.</li>
          <li className="flex gap-3"><span className="text-primary font-bold">2.</span> Our Trust & Safety team reviews your request within 3–7 business days.</li>
          <li className="flex gap-3"><span className="text-primary font-bold">3.</span> If approved, the blue checkmark appears next to your username everywhere on CrownMe.</li>
          <li className="flex gap-3"><span className="text-primary font-bold">4.</span> You'll be notified by in-app notification and email of the decision.</li>
        </ol>
      </Card>

      {/* Trust & privacy */}
      <Card className="p-5 space-y-3 bg-muted/30">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Your documents are protected</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2"><FileText className="h-4 w-4 mt-0.5 text-primary shrink-0" /><span>Stored in an encrypted, access-restricted bucket — never public.</span></div>
          <div className="flex items-start gap-2"><Eye className="h-4 w-4 mt-0.5 text-primary shrink-0" /><span>Visible only to authorized Trust & Safety reviewers.</span></div>
          <div className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" /><span>Deleted after review per our <Link to="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>.</span></div>
        </div>
      </Card>

      {request && request.status === "rejected" && (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <div className="text-sm">
            <span className="font-medium">Previous request rejected.</span> {request.review_notes ?? "You may submit a new request below."}
          </div>
        </Card>
      )}

      <Card className="p-5 space-y-4">
        <Label className="text-base">Choose a verification path</Label>
        <RadioGroup value={plan} onValueChange={(v) => setPlan(v as Plan)} className="grid sm:grid-cols-2 gap-3">
          <label className={`relative rounded-lg border p-4 cursor-pointer transition-all ${plan === "subscription" ? "border-primary bg-primary/5" : "border-border"}`}>
            <RadioGroupItem value="subscription" className="sr-only" />
            <div className="flex items-center gap-2 mb-1">
              <Crown className="h-4 w-4 text-primary" />
              <span className="font-bold">Subscription — $1.99/mo</span>
            </div>
            <p className="text-sm text-muted-foreground">Easier review for active creators. Cancel anytime; badge stays while subscribed.</p>
          </label>
          <label className={`relative rounded-lg border p-4 cursor-pointer transition-all ${plan === "standard" ? "border-primary bg-primary/5" : "border-border"}`}>
            <RadioGroupItem value="standard" className="sr-only" />
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-4 w-4" />
              <span className="font-bold">Standard — Free</span>
            </div>
            <p className="text-sm text-muted-foreground">Auto-approved once you hit 10k+ followers and complete the checklist below.</p>
          </label>
        </RadioGroup>

        {plan === "standard" && (
          <StandardEligibilityCard
            progress={progress}
            loading={progressLoading}
            claiming={claimingStandard}
            onRefresh={refreshProgress}
            onClaim={claimStandard}
          />
        )}
        {plan === "subscription" && (
          <Button
            type="button"
            variant="default"
            className="w-full"
            onClick={() =>
              openVerificationCheckout({
                priceId: "verification_monthly",
                fnName: "create-verification-checkout",
                title: "CrownMe Verified · Monthly",
                returnUrl: `${window.location.origin}/verification`,
              })
            }
          >
            <Crown className="h-4 w-4 mr-2" /> Subscribe $1.99/mo & fast-track
          </Button>
        )}

        {/* Manual review form — only the paid Subscription path uses this.
            Standard is auto-approved via the checklist above and doesn't
            require ID/selfie/business documents. */}
        {plan === "subscription" && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="v-legal">Legal name *</Label>
                <Input id="v-legal" value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-cat">Category *</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                  <SelectTrigger id="v-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABEL).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(category === "brand" || category === "business") && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="v-brand">Brand / business name *</Label>
                  <Input id="v-brand" value={brandName} onChange={(e) => setBrandName(e.target.value)} maxLength={120} />
                </div>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="v-web">Official website (optional)</Label>
                <Input id="v-web" type="url" placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="v-fol">Total external followers (across platforms)</Label>
                <Input id="v-fol" type="number" min={0} value={followerCount} onChange={(e) => setFollowerCount(e.target.value)} placeholder="e.g. 250000" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="v-reason">Why should you be verified? *</Label>
                <Textarea id="v-reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell us about your audience, your work, and any notable mentions or accomplishments." maxLength={1000} />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 pt-2">
              <FileSlot label="Government ID *" file={idFile} onFile={setIdFile} accept="image/*,application/pdf" />
              <FileSlot label="Live selfie *" file={selfieFile} onFile={setSelfieFile} accept="image/*" capture />
              {(category === "brand" || category === "business") && (
                <FileSlot label="Business document *" file={bizFile} onFile={setBizFile} accept="image/*,application/pdf" />
              )}
            </div>

            <Button onClick={submit} disabled={submitting || !legalName || !reason || !idFile || !selfieFile} size="lg" className="w-full">
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</> : "Submit verification request"}
            </Button>
            <p className="text-xs text-muted-foreground">Your documents are stored privately and visible only to CrownMe trust & safety reviewers.</p>
          </>
        )}
      </Card>
    </div>
  );
}

function FileSlot({ label, file, onFile, accept, capture }: {
  label: string; file: File | null; onFile: (f: File | null) => void; accept: string; capture?: boolean;
}) {
  return (
    <label className="flex flex-col items-stretch gap-2 cursor-pointer">
      <span className="text-sm font-medium">{label}</span>
      <div className={`border-2 border-dashed rounded-lg p-4 text-center text-xs transition-all ${file ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
        <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
        {file ? <span className="text-foreground truncate block max-w-full">{file.name}</span> : <span className="text-muted-foreground">Tap to upload</span>}
      </div>
      <input
        type="file"
        accept={accept}
        capture={capture ? "user" : undefined}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

/**
 * Live progress checklist for the free Standard verification path.
 *
 * Every check from `verification_eligibility_progress` becomes a row with:
 * - a pass/fail icon
 * - the human label
 * - for numeric checks (followers, posts, account age) a small progress
 *   bar and `current / required` count so the user can see how close they
 *   are. Followers especially is the moment-of-truth metric for the 10k
 *   threshold and we never want it hidden.
 *
 * The "Claim verification" button is disabled until every check passes; the
 * server re-validates eligibility inside `request_standard_verification`
 * so a stale UI can't ever auto-approve someone who lost a requirement.
 */
function StandardEligibilityCard({
  progress, loading, claiming, onRefresh, onClaim,
}: {
  progress: EligibilityProgress | null;
  loading: boolean;
  claiming: boolean;
  onRefresh: () => void;
  onClaim: () => void;
}) {
  if (loading && !progress) {
    return (
      <Card className="p-5 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking your eligibility…
      </Card>
    );
  }
  if (!progress) {
    return (
      <Card className="p-5 space-y-3">
        <p className="text-sm text-muted-foreground">We couldn't load your eligibility checklist.</p>
        <Button variant="outline" size="sm" onClick={onRefresh}>Retry</Button>
      </Card>
    );
  }
  const rows = orderedChecks(progress);
  const { passed, total } = passedCount(progress);
  const overallPct = Math.round((passed / total) * 100);

  return (
    <Card className="p-5 space-y-4 border-primary/30">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-wide">Standard verification progress</h3>
        </div>
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={onRefresh}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{passed} of {total} requirements met</span>
          <span>{overallPct}%</span>
        </div>
        <Progress value={overallPct} className="h-2" />
      </div>
      <ul className="space-y-3">
        {rows.map((c) => {
          const frac = checkFraction(c);
          const showBar = typeof c.current === "number" && typeof c.required === "number";
          return (
            <li key={c.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  {c.pass
                    ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className={c.pass ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
                </div>
                {showBar && (
                  <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                    {(c.current ?? 0).toLocaleString()} / {(c.required ?? 0).toLocaleString()}
                  </span>
                )}
              </div>
              {showBar && (
                <Progress value={Math.round(frac * 100)} className="h-1.5" />
              )}
            </li>
          );
        })}
      </ul>
      <div className="space-y-2">
        <Button
          size="lg"
          className="w-full"
          disabled={!progress.eligible || claiming}
          onClick={onClaim}
        >
          {claiming
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>
            : progress.eligible
              ? <><ShieldCheck className="h-4 w-4 mr-2" /> Claim free verification</>
              : "Complete every requirement to claim"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Standard Verification is <span className="text-foreground">earned through CrownMe activity</span> —
          battles won, crowns held, votes received, posts published, and 10,000+ followers. It's auto-approved
          the moment every requirement passes. Not ready yet? Paid Verification is optional at $1.99/month
          via the fast-track path above.
        </p>
      </div>
    </Card>
  );
}
