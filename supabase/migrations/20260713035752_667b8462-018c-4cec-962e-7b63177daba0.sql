ALTER TABLE public.profiles DISABLE TRIGGER trg_profiles_guard_protected_fields;
UPDATE public.profiles
SET is_founder = true,
    founder_title = 'Founding Royal',
    founder_granted_at = COALESCE(founder_granted_at, now()),
    royal_frame_variant = 'founder_gold'
WHERE id = '83cd9e7d-9173-4248-95a3-91e2e08fe403';
ALTER TABLE public.profiles ENABLE TRIGGER trg_profiles_guard_protected_fields;