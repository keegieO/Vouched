// The Supabase project URL and publishable key are public by design (row-level security protects the data).
// Environment variables win when they're set; these defaults keep the site working when they aren't.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://agtkwvwaznlkecyjvhkr.supabase.co';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_MHwfk1Ile0kr5fNW0ct7pA_TOTSJwuh';
