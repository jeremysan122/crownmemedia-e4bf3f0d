import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, User2, AlertCircle, Camera, Crop as CropIcon, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import CropEditor from "@/components/upload/CropEditor";

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

const AVATAR_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function getErrorMessage(error: unknown, fallback = "Could not save profile") {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return message ? String(message) : fallback;
  }

  return fallback;
}

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be 20 characters or fewer")
  .regex(/^[a-z0-9_.]+$/i, "Only letters, numbers, underscores and dots");

const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .max(254, "Email is too long");

const GENDER_VALUES = ["male", "female", "non_binary", "prefer_not_to_say"] as const;
type GenderValue = typeof GENDER_VALUES[number];

const profileSchema = z.object({
  username: usernameSchema,
  first_name: z.string().trim().max(50, "First name too long"),
  last_name: z.string().trim().max(50, "Last name too long"),
  bio: z.string().trim().max(200, "Bio must be 200 characters or fewer"),
  city: z.string().trim().min(1, "City is required").max(80, "City too long"),
  state: z.string().trim().min(1, "State / region is required").max(80, "State too long"),
  country: z.string().trim().min(2, "Country is required").max(80, "Country too long"),
  email: z.union([z.literal(""), emailSchema]),
  pronouns: z.string().trim().max(30, "Pronouns must be 30 characters or fewer"),
  gender: z.union([z.literal(""), z.enum(GENDER_VALUES)]),
});

type ProfileForm = z.infer<typeof profileSchema>;
type FieldErrors = Partial<Record<keyof ProfileForm, string>>;

export default function EditProfile() {
  const { profile, refreshProfile, user } = useAuth();
  const nav = useNavigate();

  const [username, setUsername] = useState(profile?.username || "");
  const [firstName, setFirstName] = useState((profile as any)?.first_name || "");
  const [lastName, setLastName] = useState((profile as any)?.last_name || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [city, setCity] = useState(profile?.city || "");
  const [state, setState] = useState(profile?.state || "");
  const [country, setCountry] = useState(profile?.country || "");
  const [email, setEmail] = useState("");
  const [emailPending, setEmailPending] = useState<string | null>(null);
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [pronouns, setPronouns] = useState<string>("");
  const [gender, setGender] = useState<GenderValue | "">("");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs when preview changes/unmounts
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  useEffect(() => {
    if (!profile || hydrated) return;

    setUsername(profile.username || "");
    setFirstName((profile as any).first_name || "");
    setLastName((profile as any).last_name || "");
    setBio(profile.bio || "");
    setCity(profile.city || "");
    setState(profile.state || "");
    setCountry(profile.country || "");
    const existing = (profile as any).links;
    if (Array.isArray(existing)) setLinks(existing.slice(0, 3).map((l: any) => ({ label: l.label || "", url: l.url || "" })));
    setPronouns(((profile as any).pronouns as string | null) || "");
    const g = ((profile as any).gender as GenderValue | null) || "";
    setGender(GENDER_VALUES.includes(g as GenderValue) ? (g as GenderValue) : "");
    // Hydrate email from the auth user. DOB is locked at signup and cannot
    // be changed here — it's a security/age-gate guarantee.
    if (user?.email) setEmail(user.email);
    const pending = (user as any)?.new_email as string | undefined;
    if (pending) setEmailPending(pending);
    setHydrated(true);
  }, [profile, hydrated, user?.id]);

  const liveErrors = useMemo(() => errors, [errors]);

  const clearFieldError = (name: keyof ProfileForm) => {
    if (!liveErrors[name]) return;

    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const onPickPhoto = (file: File | null) => {
    setPhotoErr(null);

    if (!file) {
      setPendingFile(null);
      return;
    }

    if (!AVATAR_EXT_BY_MIME[file.type]) {
      setPhotoErr("Photo must be JPG, PNG, WebP, or GIF");
      return;
    }

    if (file.size > AVATAR_MAX_BYTES) {
      setPhotoErr("Image too large. Max file size is 5MB.");
      return;
    }

    // Open crop editor so the user can frame the avatar.
    setPendingFile(file);
    setCropOpen(true);
  };

  const handleCropConfirm = (cropped: File) => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(cropped);
    setPhotoPreview(URL.createObjectURL(cropped));
    setCropOpen(false);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropCancel = () => {
    setCropOpen(false);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setPhotoFile(null);
    setPhotoErr(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const validate = (): FieldErrors => {
    const parsed = profileSchema.safeParse({
      username,
      first_name: firstName,
      last_name: lastName,
      bio,
      city,
      state,
      country,
      email: email && email !== user?.email ? email : "",
      pronouns,
      gender,
    });

    if (parsed.success) return {};

    const nextErrors: FieldErrors = {};

    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof ProfileForm;
      if (!nextErrors[key]) nextErrors[key] = issue.message;
    }

    return nextErrors;
  };

  const save = async () => {
    if (!user?.id) {
      toast.error("You must be signed in to edit your profile");
      return;
    }

    if (photoErr) {
      toast.error(photoErr);
      return;
    }

    if (saving) return;

    const fieldErrors = validate();
    setErrors(fieldErrors);

    if (Object.keys(fieldErrors).length > 0) {
      toast.error("Please fix the highlighted fields");
      return;
    }

    setSaving(true);

    let uploadedAvatarPath: string | null = null;
    // Capture the previous avatar storage path so we can delete it only after
    // a successful profile update — never delete on failure.
    const previousAvatarUrl = profile?.profile_photo_url ?? null;
    const previousAvatarPath = (() => {
      if (!previousAvatarUrl) return null;
      // Only delete files we own — strip everything up to `/avatars/` and
      // require the path to start with this user's id.
      const m = previousAvatarUrl.match(/\/avatars\/(.+)$/);
      if (!m) return null;
      const p = decodeURIComponent(m[1]);
      return p.startsWith(`${user.id}/`) ? p : null;
    })();

    try {
      const uid = user.id;
      let photoUrl = previousAvatarUrl;

      if (photoFile) {
        const ext = AVATAR_EXT_BY_MIME[photoFile.type] || "jpg";
        // Collision-safe: user folder + UUID + timestamp.
        const path = `${uid}/avatar-${crypto.randomUUID()}-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, photoFile, {
            upsert: false,
            contentType: photoFile.type,
            cacheControl: "3600",
          });

        if (uploadError) throw uploadError;

        uploadedAvatarPath = path;
        photoUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }

      const cleanedLinks = links
        .map((l) => ({ label: l.label.trim().slice(0, 40), url: l.url.trim() }))
        .filter((l) => l.url.length > 0)
        .slice(0, 3);

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: uid,
            username: username.trim().toLowerCase(),
            first_name: firstName.trim() || null,
            last_name: lastName.trim() || null,
            bio: bio.trim().slice(0, 200),
            city: city.trim(),
            state: state.trim(),
            country: country.trim(),
            profile_photo_url: photoUrl,
            links: cleanedLinks,
            pronouns: pronouns.trim() ? pronouns.trim().slice(0, 30) : null,
            gender: gender || null,
          } as any,
          { onConflict: "id" },
        );

      if (profileError) throw profileError;

      // Profile row now points at the new avatar — safe to delete the old
      // one. Storage RLS only allows the owner to remove their own paths,
      // so this can never affect another user's avatar.
      if (photoFile && uploadedAvatarPath && previousAvatarPath && previousAvatarPath !== uploadedAvatarPath) {
        try {
          await supabase.storage.from("avatars").remove([previousAvatarPath]);
        } catch { /* non-fatal: leaves an orphan blob but profile is correct */ }
        trackEvent("avatar_replaced");
      }

      // Email change → Supabase sends a confirmation link to the NEW address.
      // The change only takes effect once the user clicks that link.
      if (email && email.trim().toLowerCase() !== (user.email || "").toLowerCase()) {
        const { error: emailErr } = await supabase.auth.updateUser({ email: email.trim() });
        if (emailErr) throw emailErr;
        setEmailPending(email.trim());
        toast.message("Check your inbox", {
          description: `We sent a confirmation link to ${email.trim()}. Your email won't change until you confirm.`,
        });
      }

      await refreshProfile();

      toast.success("Profile updated");
      nav(`/u/${username.trim().toLowerCase()}`);
    } catch (error) {
      // Profile update failed — clean up the just-uploaded avatar so it
      // doesn't linger as an orphan. Leave the previous avatar untouched.
      if (uploadedAvatarPath) {
        await supabase.storage.from("avatars").remove([uploadedAvatarPath]).catch(() => {});
      }

      const message = getErrorMessage(error);

      if (/rate.?limit|too many|profile_change/i.test(message)) {
        trackEvent("profile_change_rate_limited");
        toast.error("You're changing your profile too quickly. Please wait a bit and try again.");
      } else if (/duplicate key|unique|profiles_username|username/i.test(message)) {
        toast.error("That username is already taken. Please choose another one.");
      } else if (/row-level security|permission denied|policy/i.test(message)) {
        toast.error("Profile update blocked by permissions. Please refresh and try again.");
      } else if (/bucket|avatars|storage/i.test(message)) {
        toast.error(`Avatar upload failed: ${message}`);
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };


  const FieldErr = ({ name }: { name: keyof ProfileForm }) =>
    liveErrors[name] ? (
      <p className="text-[11px] text-destructive flex items-center gap-1 mt-1" role="alert">
        <AlertCircle size={11} /> {liveErrors[name]}
      </p>
    ) : null;

  return (
    <AppShell title="EDIT PROFILE">
      <div className="px-4 py-4 space-y-5 max-w-2xl mx-auto">
        <button
          type="button"
          onClick={() => nav(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          aria-label="Go back"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <header className="flex items-center gap-2">
          <User2 className="text-gold" size={22} />
          <h1 className="font-display text-2xl text-gold">Edit Profile</h1>
        </header>

        <p className="text-xs text-muted-foreground -mt-3">
          Update your photo, username, bio, and location. For notification, privacy, and account
          settings, visit{" "}
          <button
            type="button"
            className="underline text-primary"
            onClick={() => nav("/settings")}
          >
            Settings
          </button>
          .
        </p>

        <section className="royal-card p-4 space-y-4">
          <div>
            <Label htmlFor="ep-photo">Profile Photo</Label>

            <div className="mt-2 flex items-center gap-4">
              <div className="relative h-20 w-20 shrink-0 rounded-full overflow-hidden border-2 border-gold/40 bg-muted">
                {photoPreview ? (
                  <img loading="lazy" src={photoPreview} alt="New avatar preview" className="h-full w-full object-cover" />
                ) : profile?.profile_photo_url ? (
                  <img loading="lazy" src={profile.profile_photo_url} alt="Current avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                    <User2 size={28} />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-1"
                  >
                    <Camera size={14} /> {photoPreview ? "Change photo" : "Upload photo"}
                  </Button>

                  {photoPreview && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { setPendingFile(photoFile); setCropOpen(true); }}
                        className="gap-1"
                      >
                        <CropIcon size={14} /> Re-crop
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearPhoto}
                        className="gap-1 text-muted-foreground"
                      >
                        <X size={14} /> Remove
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  JPG, PNG, WebP, or GIF — up to 5MB. You'll be able to crop and rotate after picking.
                </p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              id="ep-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) => onPickPhoto(event.target.files?.[0] || null)}
              className="hidden"
            />

            {photoErr && (
              <p className="text-[11px] text-destructive flex items-center gap-1 mt-2" role="alert">
                <AlertCircle size={11} /> {photoErr}
              </p>
            )}
          </div>

          <CropEditor
            open={cropOpen}
            file={pendingFile}
            cropShape="round"
            onConfirm={handleCropConfirm}
            onCancel={handleCropCancel}
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="ep-first">First name</Label>
              <Input
                id="ep-first"
                value={firstName}
                onChange={(event) => { setFirstName(event.target.value); clearFieldError("first_name"); }}
                maxLength={50}
                autoComplete="given-name"
                className="bg-input mt-1"
                aria-invalid={!!liveErrors.first_name}
              />
              <FieldErr name="first_name" />
            </div>
            <div>
              <Label htmlFor="ep-last">Last name</Label>
              <Input
                id="ep-last"
                value={lastName}
                onChange={(event) => { setLastName(event.target.value); clearFieldError("last_name"); }}
                maxLength={50}
                autoComplete="family-name"
                className="bg-input mt-1"
                aria-invalid={!!liveErrors.last_name}
              />
              <FieldErr name="last_name" />
            </div>
          </div>

          <div>
            <Label htmlFor="ep-username">Username</Label>

            <Input
              id="ep-username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value.toLowerCase());
                clearFieldError("username");
              }}
              maxLength={20}
              placeholder="3–20 chars, letters/numbers/_."
              className="bg-input mt-1"
              aria-invalid={!!liveErrors.username}
            />

            <FieldErr name="username" />
          </div>

          <div>
            <Label htmlFor="ep-bio">Bio</Label>

            <Textarea
              id="ep-bio"
              value={bio}
              onChange={(event) => {
                setBio(event.target.value);
                clearFieldError("bio");
              }}
              maxLength={200}
              placeholder="Tell the kingdom about yourself…"
              className="bg-input mt-1"
              aria-invalid={!!liveErrors.bio}
            />

            <div className="text-right text-[10px] text-muted-foreground tabular-nums">
              {bio.length}/200
            </div>

            <FieldErr name="bio" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="ep-pronouns">Pronouns</Label>
              <Input
                id="ep-pronouns"
                value={pronouns}
                onChange={(event) => { setPronouns(event.target.value); clearFieldError("pronouns"); }}
                maxLength={30}
                placeholder="she/her, he/him, they/them…"
                className="bg-input mt-1"
                aria-invalid={!!liveErrors.pronouns}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Shown next to your username on your profile.</p>
              <FieldErr name="pronouns" />
            </div>
            <div>
              <Label htmlFor="ep-gender">Gender</Label>
              <select
                id="ep-gender"
                value={gender}
                onChange={(event) => { setGender(event.target.value as GenderValue | ""); clearFieldError("gender"); }}
                className="mt-1 w-full h-10 rounded-md border border-input bg-input px-3 text-sm"
                aria-invalid={!!liveErrors.gender}
              >
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non_binary">Non-binary</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">Used for King / Queen crown titles.</p>
              <FieldErr name="gender" />
            </div>
          </div>


          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="ep-city">City *</Label>

              <Input
                id="ep-city"
                value={city}
                onChange={(event) => {
                  setCity(event.target.value);
                  clearFieldError("city");
                }}
                className="bg-input mt-1"
                aria-invalid={!!liveErrors.city}
              />

              <FieldErr name="city" />
            </div>

            <div>
              <Label htmlFor="ep-state">State / Region *</Label>

              <Input
                id="ep-state"
                value={state}
                onChange={(event) => {
                  setState(event.target.value);
                  clearFieldError("state");
                }}
                className="bg-input mt-1"
                aria-invalid={!!liveErrors.state}
              />

              <FieldErr name="state" />
            </div>
          </div>

          <div>
            <Label htmlFor="ep-country">Country *</Label>

            <Input
              id="ep-country"
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                clearFieldError("country");
              }}
              className="bg-input mt-1"
              aria-invalid={!!liveErrors.country}
            />

            <FieldErr name="country" />
          </div>

          <div>
            <Label htmlFor="ep-email">Email address</Label>

            <Input
              id="ep-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearFieldError("email");
              }}
              autoComplete="email"
              maxLength={254}
              placeholder="you@example.com"
              className="bg-input mt-1"
              aria-invalid={!!liveErrors.email}
            />

            <p className="text-[10px] text-muted-foreground mt-1">
              Changing your email sends a confirmation link to the new address. The change
              only takes effect once you click that link. Your date of birth is locked at
              signup and can't be changed here.
            </p>

            {emailPending && emailPending.toLowerCase() !== (user?.email || "").toLowerCase() && (
              <p className="text-[11px] text-amber-400 mt-1">
                Pending confirmation: <span className="font-medium">{emailPending}</span>
              </p>
            )}

            <FieldErr name="email" />
          </div>


          <div className="space-y-2 border-t border-border/40 pt-4">
            <Label>Profile links (up to 3)</Label>
            <p className="text-[11px] text-muted-foreground">Must start with https://. Shown as chips on your profile.</p>
            {[0, 1, 2].map((i) => {
              const v = links[i] || { label: "", url: "" };
              const setAt = (patch: Partial<{ label: string; url: string }>) => {
                setLinks((prev) => {
                  const next = [...prev];
                  while (next.length <= i) next.push({ label: "", url: "" });
                  next[i] = { ...next[i], ...patch };
                  return next;
                });
              };
              return (
                <div key={i} className="grid grid-cols-[120px_1fr] gap-2">
                  <Input placeholder="Label" value={v.label} maxLength={40} onChange={(e) => setAt({ label: e.target.value })} className="bg-input" />
                  <Input placeholder="https://..." value={v.url} maxLength={300} onChange={(e) => setAt({ url: e.target.value })} className="bg-input" />
                </div>
              );
            })}
          </div>

          <Button
            onClick={save}
            disabled={saving}
            className="w-full bg-gradient-gold text-primary-foreground"
          >
            <Save size={14} className="mr-1.5" />
            {saving ? "Saving…" : "Save Profile"}
          </Button>
        </section>
      </div>
    </AppShell>
  );
}
