import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ref from './reference.json';
import extra from './extra.js';
import more from './more.js';
import v3 from './v3.js';
import { api } from '../api.js';

const LangCtx = createContext(null);
export const LANGS = [['en', 'English'], ['hi', 'हिंदी'], ['gu', 'ગુજરાતી']];

function initialLang() {
  try {
    const l = localStorage.getItem('ww_lang');
    return LANGS.some(([k]) => k === l) ? l : 'en';
  } catch {
    return 'en';
  }
}

// Built-in text for a language (English fills any gap). The administrator's edits are layered on top.
export const defaultsFor = (lang) => ({ ...ref.en, ...extra.en, ...more.en, ...v3.en, ...ref[lang], ...extra[lang], ...more[lang], ...v3[lang] });

export function LangProvider({ children }) {
  const [lang, setLang] = useState(initialLang);
  const [overrides, setOverrides] = useState({});
  const refresh = useCallback(() => { api('/api/content').then(setOverrides).catch(() => {}); }, []);
  useEffect(refresh, [refresh]);
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('ww_lang', lang); } catch { /* private mode */ }
  }, [lang]);
  const value = useMemo(() => ({
    lang, setLang, refresh, overrides,
    t: { ...defaultsFor('en'), ...defaultsFor(lang), ...(overrides.en || {}), ...(overrides[lang] || {}) },
  }), [lang, overrides, refresh]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);

// fmt('about {m} m', { m: 5 }) -> 'about 5 m'
export const fmt = (s, vars = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
