
-- Shekel bundles → lovable payments lookup keys
UPDATE public.shekel_bundles SET stripe_price_id = 'shekels_starter_pouch'   WHERE id = '76289ae8-cbf8-45ad-8ad3-291d95527289';
UPDATE public.shekel_bundles SET stripe_price_id = 'shekels_royal_bag'       WHERE id = 'e1448222-3771-4efe-b020-2545c832f3aa';
UPDATE public.shekel_bundles SET stripe_price_id = 'shekels_noble_chest'     WHERE id = '59bb1eb0-97f4-46a8-874e-061ad7da348a';
UPDATE public.shekel_bundles SET stripe_price_id = 'shekels_crown_vault'     WHERE id = '1b4a7a66-edd6-4a1e-b3cf-cbd38325e45d';
UPDATE public.shekel_bundles SET stripe_price_id = 'shekels_kings_hoard'     WHERE id = '19ddd32b-bdfe-4afb-bfe2-6ecb49972f12';
UPDATE public.shekel_bundles SET stripe_price_id = 'shekels_empire_treasury' WHERE id = '3c3876dc-9208-4c01-afc0-958ae6f9ea66';

-- Boost bundles
UPDATE public.boost_bundles SET stripe_price_id = 'boost_royal'           WHERE id = 'e151740c-3621-4c0d-8a92-48e6950277c6';
UPDATE public.boost_bundles SET stripe_price_id = 'boost_vote'            WHERE id = '7bb4aef7-2893-4eb6-9192-5da8343f3739';
UPDATE public.boost_bundles SET stripe_price_id = 'boost_crown_spotlight' WHERE id = 'ee12b635-6d79-42d0-a938-34833b0fd1e3';
UPDATE public.boost_bundles SET stripe_price_id = 'boost_profile_glow'    WHERE id = 'f0048a46-d5a7-4c4e-81f8-da2ba76ebe19';
UPDATE public.boost_bundles SET stripe_price_id = 'boost_crown_shield'    WHERE id = 'ff7744fc-72c7-4636-8171-122feae1e7fe';

-- Royal Pass plans
UPDATE public.royal_pass_plans SET stripe_price_id = 'royal_pass_monthly' WHERE id = '8a572bf4-1511-4749-ad73-fbb918f3d7c2';
