CREATE OR REPLACE FUNCTION public.trg_notify_vote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  IF tg_op = 'INSERT' AND new.vote_type::text <> 'dislike' THEN
    SELECT user_id INTO v_owner FROM public.posts WHERE id = new.post_id;
    IF v_owner IS NOT NULL AND v_owner <> new.user_id THEN
      INSERT INTO public.notifications (user_id, type, title, body, payload)
      VALUES (v_owner, 'vote', 'New ' || new.vote_type::text || ' vote', 'Someone voted on your post',
              jsonb_build_object('post_id', new.post_id, 'voter_id', new.user_id, 'vote_type', new.vote_type));
    END IF;
  END IF;
  RETURN NULL;
END $$;