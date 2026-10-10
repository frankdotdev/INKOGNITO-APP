import type { Matchmaker } from './matchmaker';
import type { Room } from './room';
export interface Env {
  MATCHMAKER: DurableObjectNamespace<Matchmaker>;
  ROOM: DurableObjectNamespace<Room>;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY: string;
  ROOM_SECRET: string;
  ALLOWED_ORIGINS: string;
  CF_TURN_KEY_ID?: string; // Cloudflare Realtime TURN (optional; without it only STUN is offered, which fails behind strict NATs)
  CF_TURN_API_TOKEN?: string;
}
