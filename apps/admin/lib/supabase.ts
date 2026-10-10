import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.admin.example).');
// Admins sign in with email + password + TOTP. This app never signs in anonymously.
export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
