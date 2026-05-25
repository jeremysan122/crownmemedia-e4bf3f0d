
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON public.posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_visible_created ON public.posts(created_at DESC) WHERE is_removed = false AND is_archived = false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id) WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_messages_pair_created ON public.messages(sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread ON public.messages(receiver_id) WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_gift_tx_receiver_created ON public.gift_transactions(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_tx_sender_created ON public.gift_transactions(sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id);

CREATE INDEX IF NOT EXISTS idx_votes_post ON public.votes(post_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_created ON public.votes(user_id, created_at DESC);
