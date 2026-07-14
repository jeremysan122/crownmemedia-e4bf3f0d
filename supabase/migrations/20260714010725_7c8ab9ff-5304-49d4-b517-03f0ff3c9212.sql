CREATE POLICY "Users view their own royal reversals"
ON public.royal_pass_reversals
FOR SELECT
TO authenticated
USING (user_id = auth.uid());