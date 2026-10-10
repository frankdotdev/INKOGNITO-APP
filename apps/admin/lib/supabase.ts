import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-key';
// Admins sign in with email + password + TOTP. This app never signs in anonymously.
export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
