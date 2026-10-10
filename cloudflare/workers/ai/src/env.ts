export interface Env {
  SUPABASE_URL: string; SUPABASE_ANON_KEY: string; SUPABASE_SERVICE_KEY: string; ALLOWED_ORIGINS: string;
  GROQ_API_KEY: string; GEMINI_API_KEY: string; AI_DATA_KEY: string; AI_GROQ_MODEL: string; AI_GEMINI_MODEL: string;
  GROQ_BASE_URL?: string; GEMINI_BASE_URL?: string; // optional overrides (proxies, tests)
}
