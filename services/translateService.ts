
import { supabase } from '../supabaseClient';

/**
 * 翻译服务 - 对接 Google Cloud Translation API (通过云控制集成)
 */
export const translateToChinese = async (text: string): Promise<string> => {
  if (!text || text.trim() === '') return text;
  
  try {
    // 这里我们可以利用你在本地配置的 Google Cloud 凭据
    // 在生产环境中，这通常通过后端 Edge Function 或 API Gateway 转发
    // 目前我们先构建接口结构，你可以通过这里的 API Key 直接调用
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY; // 复用你的 Google API Key
    const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        q: text,
        target: 'zh'
      }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    return data.data.translations[0].translatedText || text;
  } catch (error) {
    console.error('Translation error:', error);
    return text; // 失败则返回原文字
  }
};
