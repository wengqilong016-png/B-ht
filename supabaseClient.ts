import { createClient } from '@supabase/supabase-js';

// 使用 'EOF' (带引号) 防止 Bash 解析 $ 符号
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://yctsiudhicztvppddbvk.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjU4NDgsImV4cCI6MjA4NzIwMTg0OH0.MkLFBP9GIjY21tfWepQFyaCAC5KHCzUVcYOB43g4s4U';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabase;
