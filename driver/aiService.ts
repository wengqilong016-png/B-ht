import { GoogleGenAI } from '@google/genai';

const genAI = new GoogleGenAI(import.meta.env.VITE_GEMINI_API_KEY);

/**
 * 识别博弈机读数
 * @param base64Image 图片的 base64 字符串 (不含 Data URL 前缀)
 */
export const recognizeScoreFromImage = async (base64Image: string): Promise<number | null> => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = '你是一个专业的博弈机数据审计员。请识别这张照片中博弈机屏幕上的数字（通常是当前分值）。只返回数字，不要有任何多余的文字。如果无法识别，请只返回“无法识别”四个字，不要包含任何数字或其他内容。';

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: 'image/jpeg'
        }
      }
    ]);

    const text = result.response.text().trim();
    const score = parseInt(text.replace(/[^0-9]/g, ''), 10);
    
    return isNaN(score) ? null : score;
  } catch (error) {
    console.error('AI 识别读数失败:', error);
    return null;
  }
};
