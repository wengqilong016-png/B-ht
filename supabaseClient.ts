// supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

// 强制注入配置（这是你的 Supabase 恢复后的地址）
export const SUPABASE_URL = 'https://yctsiudhicztvppddbvk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjU4NDgsImV4cCI6MjA4NzIwMTg0OH0.MkLFBP9GIjY21tfWepQFyaCAC5KHCzUVcYOB43g4s4U';

const hasSupabaseConfig = true; // 强制设为 true

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const checkDbHealth = async () => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('drivers').select('id').limit(1);
    return !error;
  } catch (err) {
    return false;
  }
};

export default supabase;