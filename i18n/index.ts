import { sw } from './sw';
import { zh } from './zh';

export type Lang = 'zh' | 'sw';

export const TRANSLATIONS: Record<Lang, Record<string, string>> = { zh, sw };

export type TranslationKey = keyof typeof zh;

export const t = (lang: Lang, key: string): string => {
  return TRANSLATIONS[lang]?.[key] || key;
};
