-- Trim any existing oversized bodies so the constraint can be added safely
UPDATE public.comments
SET body = left(body, 500)
WHERE char_length(body) > 500;

-- Enforce 1..500 char length at the DB level (authoritative guard)
ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_body_length;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_body_length
  CHECK (char_length(body) BETWEEN 1 AND 500);