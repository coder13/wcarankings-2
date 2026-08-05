import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "@/translations/en";

const defaultLocale = "en";

if (i18n.isInitialized) {
  i18n.addResourceBundle(defaultLocale, "translation", en, true, true);
} else {
  void i18n.use(initReactI18next).init({
    defaultNS: "translation",
    fallbackLng: defaultLocale,
    initAsync: false,
    interpolation: { escapeValue: false },
    lng: defaultLocale,
    resources: {
      [defaultLocale]: { translation: en },
    },
    supportedLngs: [defaultLocale],
  });
}

export { i18n };
