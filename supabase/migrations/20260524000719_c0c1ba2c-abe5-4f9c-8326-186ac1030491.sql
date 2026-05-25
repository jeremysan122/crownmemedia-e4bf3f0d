-- Deduplicate votes: keep only most recent per (user_id, post_id)
DELETE FROM public.votes v
USING public.votes v2
WHERE v.user_id = v2.user_id
  AND v.post_id = v2.post_id
  AND (v.created_at < v2.created_at
       OR (v.created_at = v2.created_at AND v.id < v2.id));

-- Swap unique constraint from (user, post, vote_type) to (user, post)
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_user_id_post_id_vote_type_key;
ALTER TABLE public.votes ADD CONSTRAINT votes_user_post_unique UNIQUE (user_id, post_id);