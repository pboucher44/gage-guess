-- Create table for game rooms
CREATE TABLE IF NOT EXISTS public.game_rooms (
  code TEXT PRIMARY KEY,
  max_number INTEGER NOT NULL,
  has_used_reverse BOOLEAN NOT NULL DEFAULT false,
  state TEXT NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for players in rooms
CREATE TABLE IF NOT EXISTS public.game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL REFERENCES public.game_rooms(code) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  is_host BOOLEAN NOT NULL DEFAULT false,
  number INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(room_code, player_id)
);

-- Enable RLS (but allow all operations for this game)
ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;

-- Allow all operations (public game, no auth required)
CREATE POLICY "Allow all operations on game_rooms" ON public.game_rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on game_players" ON public.game_players FOR ALL USING (true) WITH CHECK (true);

-- Auto-delete old rooms (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_old_rooms()
RETURNS void AS $$
BEGIN
  DELETE FROM public.game_rooms WHERE updated_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_game_players_room_code ON public.game_players(room_code);
CREATE INDEX IF NOT EXISTS idx_game_rooms_updated_at ON public.game_rooms(updated_at);