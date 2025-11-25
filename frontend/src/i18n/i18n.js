import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import it from '../locales/it.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import ru from '../locales/ru.json';
import ja from '../locales/ja.json';
import zh from '../locales/zh.json';

i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Init i18next
  .init({
    resources: {
      it: { translation: it },
      en: { translation: en },
      es: { translation: es },
      ru: { translation: ru },
      ja: { translation: ja },
      zh: { translation: zh }
    },
    fallbackLng: 'it', // Default language
    debug: false,
    interpolation: {
      escapeValue: false // React already escapes
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

export default i18n;
