import type { Locale } from '#figatellultimate/locales';
import type { Messages } from '#figatellultimate/messages';

// next-intl typed by figatellultimate's generated types: locales from the config, message keys and ICU arguments
// from the validated messages.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
