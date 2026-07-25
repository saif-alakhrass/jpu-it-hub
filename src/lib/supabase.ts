import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kkkibrrxfeziyqoutred.supabase.co';
const supabaseAnonKey = 'sb_publishable_-eHn9ppB1fds92hZkYp5zw_lHmUMcrD';

export const isSupabaseConfigured = true;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
