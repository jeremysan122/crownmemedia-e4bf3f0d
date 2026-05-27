import { useEffect, useState } from "react";
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
import { toast } from "sonner";
import { ShieldCheck, Crown, Upload, Loader2, ArrowLeft } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { Link } from "react-router-dom";

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
  const { user } = useAuth();
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

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: prof }, { data: req }] = await Promise.all([
        supabase.from("profiles").select("verified").eq("id", user.id).maybeSingle(),
        supabase.from("verification_requests").select("*").eq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setVerified(!!prof?.verified);
      setRequest(req as Request | null);
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
    return (
      <div className="mx-auto max-w-2xl p-6 space-y-4">
        <Card className="p-6 text-center space-y-3">
          <VerifiedBadge size={48} className="mx-auto" />
          <h1 className="text-2xl font-serif font-bold">You're verified</h1>
          <p className="text-muted-foreground">Your profile displays the verified badge across CrownMe.</p>
          <Button asChild variant="outline"><Link to="/me">View profile</Link></Button>
        </Card>
      </div>
    );
  }

  if (request && (request.status === "pending" || request.status === "more_info_required")) {
    return (
      <div className="mx-auto max-w-2xl p-6 space-y-4">
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
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-serif font-bold">Get Verified</h1>
        </div>
        <p className="text-muted-foreground">Verified accounts get a blue checkmark next to their username — a public mark of authenticity.</p>
      </header>

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
            <p className="text-sm text-muted-foreground">Free, but requires 100k+ followers OR an established brand / public figure / journalist.</p>
          </label>
        </RadioGroup>
        {plan === "subscription" && (
          <Button
            type="button"
            variant="default"
            className="w-full"
            onClick={async () => {
              try {
                const { data, error } = await supabase.functions.invoke("create-verification-checkout", {
                  body: { return_path: "/verification" },
                });
                if (error) throw error;
                const url = (data as any)?.url;
                if (!url) throw new Error("No checkout URL returned");
                window.location.href = url;
              } catch (e: any) {
                toast.error(e?.message ?? "Could not start checkout");
              }
            }}
          >
            <Crown className="h-4 w-4 mr-2" /> Subscribe $1.99/mo & fast-track
          </Button>
        )}

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
