import * as idb from 'idb-keyval';
import { CONSTANTS } from '../types';

export const localDB = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const val = await idb.get(key);
      return val as T || null;
    } catch (err) {
      console.warn(`[localDB] Failed to get ${key} from IDB, falling back to localStorage`, err);
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) as T : null;
      } catch (e) {
        return null;
      }
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await idb.set(key, value);
    } catch (err) {
      console.warn(`[localDB] Failed to set ${key} in IDB, falling back to localStorage`, err);
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.error(`[localDB] localStorage fallback failed for ${key}`, e);
      }
    }
  },

  async clear(key: string): Promise<void> {
    try {
      await idb.del(key);
    } catch (err) {
      localStorage.removeItem(key);
    }
  }
};
