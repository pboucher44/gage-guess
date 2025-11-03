-- Fix search_path for cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_old_rooms()
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.game_rooms WHERE updated_at < now() - interval '1 hour';
END;
$$;