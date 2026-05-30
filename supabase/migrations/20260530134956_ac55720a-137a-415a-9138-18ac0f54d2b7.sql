-- Remove sensitive financial tables from public Realtime publication.
-- CDC events on these tables could leak across users via crafted topic subscriptions.
ALTER PUBLICATION supabase_realtime DROP TABLE public.wallets;
ALTER PUBLICATION supabase_realtime DROP TABLE public.payouts;
ALTER PUBLICATION supabase_realtime DROP TABLE public.shekel_ledger;