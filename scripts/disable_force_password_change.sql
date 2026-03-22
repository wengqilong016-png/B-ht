-- 关闭所有账号的强制改密码标记
-- Run this in Supabase Dashboard → SQL Editor
UPDATE public.profiles SET must_change_password = FALSE;
