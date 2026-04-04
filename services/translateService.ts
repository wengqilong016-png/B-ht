/**
 * 翻译服务 - 通过同源 API 调用服务端翻译代理，避免在浏览器暴露私钥。
 */
export const translateToChinese = async (text: string): Promise<string> => {
  if (!text || text.trim() === '') return text;
  
  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        target: 'zh',
      }),
    });

    if (!response.ok) {
      return text;
    }

    const data = await response.json();
    return data.translatedText || text;
  } catch (error) {
    console.error('Translation error:', error);
    return text; // 失败则返回原文字
  }
};
