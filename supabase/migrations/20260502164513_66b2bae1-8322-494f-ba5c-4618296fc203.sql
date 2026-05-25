DROP TRIGGER IF EXISTS battles_completed_trg ON public.battles;
CREATE TRIGGER battles_completed_trg
AFTER UPDATE ON public.battles
FOR EACH ROW
EXECUTE FUNCTION public.trg_battle_completed();