import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../services/api';
import type { Language } from '../types';

interface I18nContextValue {
  lang: string;
  direction: 'ltr' | 'rtl';
  languages: Language[];
  setLanguage: (code: string) => void;
  t: (key: string, fallback?: string) => string;
  refreshLanguages: () => Promise<void>;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const LANG_STORAGE_KEY = 'dineeasy_selected_lang';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<string>(() => {
    try {
      return localStorage.getItem(LANG_STORAGE_KEY) || 'en';
    } catch {
      return 'en';
    }
  });
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');
  const [languages, setLanguages] = useState<Language[]>([]);
  const [translations, setTranslations] = useState<Record<string, string>>({});

  const refreshLanguages = useCallback(async () => {
    try {
      const res = await apiRequest<{ languages: Language[] }>('/api/languages');
      setLanguages(res.languages);
    } catch (err) {
      console.error('Failed to load languages', err);
    }
  }, []);

  const loadTranslations = useCallback(async (code: string) => {
    try {
      const res = await apiRequest<{
        language: { code: string; direction: 'ltr' | 'rtl' };
        translations: Record<string, string>;
      }>(`/api/translations/${encodeURIComponent(code)}`);
      setTranslations(res.translations || {});
      const dir = res.language?.direction === 'rtl' ? 'rtl' : 'ltr';
      setDirection(dir);
      document.documentElement.dir = dir;
      document.documentElement.lang = code;
    } catch (err) {
      console.error('Failed to load translations', err);
    }
  }, []);

  useEffect(() => {
    void refreshLanguages();
  }, [refreshLanguages]);

  useEffect(() => {
    void loadTranslations(lang);
  }, [lang, loadTranslations]);

  const setLanguage = useCallback((code: string) => {
    setLang(code);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      return translations[key] || fallback || key;
    },
    [translations]
  );

  return (
    <I18nContext.Provider value={{ lang, direction, languages, setLanguage, t, refreshLanguages }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
