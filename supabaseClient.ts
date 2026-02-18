
import { createClient } from '@supabase/supabase-js';

// 优先从 Vercel 环境变量读取，如果没有则使用备用硬编码（仅建议开发测试使用）
// 注意：在 Vercel 部署时，请在 Settings -> Environment Variables 中添加这两个变量
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://smouwcsqimfwdwrgpons.supabase.co';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtb3V3Y3NxaW1md2R3cmdwb25zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MTY1NjAsImV4cCI6MjA4Mjk5MjU2MH0.3itabnaWFjXjSo4HJQRMfJUMpPtSYJTtf-QrC7iyGLo';

// 允许通过 UI 手动覆盖配置（用于紧急调试）
const getFinalConfig = () => {
    const storedUrl = localStorage.getItem('bahati_supa_url');
    const storedKey = localStorage.getItem('bahati_supa_key');
    return {
        url: storedUrl || SUPABASE_URL,
        key: storedKey || SUPABASE_ANON_KEY
    };
};

const config = getFinalConfig();

// 创建单例客户端
export const supabase = createClient(config.url, config.key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export const saveSupabaseConfig = (url: string, key: string) => {
    localStorage.setItem('bahati_supa_url', url.trim());
    localStorage.setItem('bahati_supa_key', key.trim());
    window.location.reload();
};

export const clearSupabaseConfig = () => {
    localStorage.removeItem('bahati_supa_url');
    localStorage.removeItem('bahati_supa_key');
    window.location.reload();
};

export const checkDbHealth = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('drivers').select('count', { count: 'exact', head: true });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("DB Health Check Failed:", err);
    return false;
  }
};

export const testConnectionDetails = async (): Promise<{ success: boolean; message: string; latency: number }> => {
    const start = Date.now();
    try {
        const { error } = await supabase.from('drivers').select('count', { count: 'exact', head: true });
        const latency = Date.now() - start;
        
        if (error) {
            return { 
                success: false, 
                message: `API Error: ${error.message} (Code: ${error.code})`, 
                latency 
            };
        }
        return { success: true, message: 'Connection Successful', latency };
    } catch (e: any) {
        return { 
            success: false, 
            message: e.message || 'Network unreachable or URL invalid', 
            latency: Date.now() - start 
        };
    }
};
