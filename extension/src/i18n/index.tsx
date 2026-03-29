import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import en from "./locales/en";
import ko from "./locales/ko";
import ja from "./locales/ja";
import zh from "./locales/zh";

export type Locale = "en" | "ko" | "ja" | "zh";
export type MessageKey = keyof typeof en;
type Messages = Record<MessageKey, string>;

const allMessages: Record<Locale, Messages> = {
  en: en as unknown as Messages,
  ko,
  ja,
  zh,
};

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ko", label: "한국어" },
  { value: "ja", label: "日本語" },
  { value: "zh", label: "中文" },
];

function detectLocale(): Locale {
  const saved = localStorage.getItem("locale") as Locale | null;
  if (saved && saved in allMessages) return saved;

  const uiLang = chrome.i18n?.getUILanguage?.()?.split("-")[0];
  if (uiLang && uiLang in allMessages) return uiLang as Locale;

  const navLang = navigator.language.split("-")[0];
  if (navLang && navLang in allMessages) return navLang as Locale;

  return "en";
}

function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  const [messages, setMessages] = useState<Messages>(
    allMessages[detectLocale()],
  );

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    setMessages(allMessages[newLocale]);
    localStorage.setItem("locale", newLocale);
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>): string => {
      if (params && "count" in params) {
        const count = Number(params.count);
        const pluralKey = `${key}_other` as MessageKey;
        if (count !== 1 && pluralKey in messages) {
          return interpolate(messages[pluralKey], params);
        }
      }
      const template = messages[key] ?? (en as unknown as Messages)[key] ?? String(key);
      return interpolate(template, params);
    },
    [messages],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx;
}

/** Get current locale outside React (for storage/lib functions) */
export function getLocale(): Locale {
  const saved = localStorage.getItem("locale") as Locale | null;
  return saved && saved in allMessages ? saved : "en";
}
