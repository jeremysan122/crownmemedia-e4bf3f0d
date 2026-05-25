-- Rank history snapshots
CREATE TABLE public.rank_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  category public.crown_category NOT NULL,
  scope public.region_type NOT NULL,
  region text NOT NULL,
  rank integer,
  total integer NOT NULL DEFAULT 0,
  crown_score numeric NOT NULL DEFAULT 0,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rank_snapshots_post_time ON public.rank_snapshots(post_id, captured_at DESC);
CREATE INDEX idx_rank_snapshots_scope ON public.rank_snapshots(scope, region, category, captured_at DESC);

ALTER TABLE public.rank_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rank snapshots viewable by everyone"
  ON public.rank_snapshots FOR SELECT USING (true);

CREATE POLICY "Only admins insert rank snapshots"
  ON public.rank_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Filter streaks (display-only, no rewards)
CREATE TABLE public.filter_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  filter text NOT NULL,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_vote_date date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, filter)
);

CREATE INDEX idx_filter_streaks_user ON public.filter_streaks(user_id);

ALTER TABLE public.filter_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own filter streaks"
  ON public.filter_streaks FOR SELECT USING (auth.uid() = user_id);

-- Function: update streak for caller after casting a vote on a filtered post
CREATE OR REPLACE FUNCTION public.bump_filter_streak(_filter text)
RETURNS public.filter_streaks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_existing public.filter_streaks;
  v_new_current int;
  v_result public.filter_streaks;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _filter IS NULL OR _filter NOT IN (
    'sepia','noir','vivid','fade','chrome',
    'shimmer','glitch','pulse-glow','scanlines','gold-sparkle'
  ) THEN
    RAISE EXCEPTION 'Invalid filter: %', _filter;
  END IF;

  SELECT * INTO v_existing
    FROM public.filter_streaks
    WHERE user_id = v_user AND filter = _filter
    FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.filter_streaks (user_id, filter, current_streak, longest_streak, last_vote_date)
    VALUES (v_user, _filter, 1, 1, v_today)
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  IF v_existing.last_vote_date = v_today THEN
    RETURN v_existing;
  ELSIF v_existing.last_vote_date = v_today - INTERVAL '1 day' THEN
    v_new_current := v_existing.current_streak + 1;
  ELSE
    v_new_current := 1;
  END IF;

  UPDATE public.filter_streaks
    SET current_streak = v_new_current,
        longest_streak = GREATEST(longest_streak, v_new_current),
        last_vote_date = v_today,
        updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_filter_streak(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bump_filter_streak(text) TO authenticated;