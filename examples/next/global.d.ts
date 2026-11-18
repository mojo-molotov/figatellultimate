import type { Locale } from '#figatellu/locales';
import type { Messages } from '#figatellu/messages';

// next-intl typed by figatellu's generated types: locales from the config, message keys and ICU arguments
// from the validated messages.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
