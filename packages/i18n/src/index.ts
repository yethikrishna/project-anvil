/**
 * @anvil/i18n — Type-safe internationalization with RTL support.
 *
 * Usage:
 * ```ts
 * import {t, initI18n} from '@anvil/i18n';
 *
 * initI18n('en'); // or 'hi', 'ja', 'ar', etc.
 *
 * t('drive.title') // "Drive"
 * t('common.save') // "Save"
 * ```
 */

// ── Types ──

export type Locale = 'en' | 'hi' | 'ja' | 'zh' | 'es' | 'fr' | 'de' | 'ar' | 'ko' | 'pt';

export interface LocaleData {
  code: Locale;
  name: string;
  rtl: boolean;
  dateFormat: string;
  timeFormat: string;
  numberFormat: {
    decimal: string;
    thousands: string;
  };
  messages: Record<string, string>;
}

// ── Message Store ──

const locales = new Map<string, LocaleData>();
let currentLocale: Locale = 'en';

export function registerLocale(data: LocaleData) {
  locales.set(data.code, data);
}

export function initI18n(locale: Locale) {
  if (!locales.has(locale)) {
    console.warn(`Locale "${locale}" not registered, falling back to English`);
    locale = 'en';
  }
  currentLocale = locale;
}

export function getCurrentLocale(): Locale {
  return currentLocale;
}

export function getLocaleData(): LocaleData {
  return locales.get(currentLocale) ?? locales.get('en')!;
}

export function isRTL(): boolean {
  return getLocaleData().rtl;
}

/**
 * Translate a key with optional interpolation.
 * Supports {{variable}} syntax.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = locales.get(currentLocale);
  const message = locale?.messages[key] ?? locales.get('en')?.messages[key] ?? key;

  if (!params) return message;

  return Object.entries(params).reduce(
    (msg, [k, v]) => msg.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
    message
  );
}

/**
 * Format a number according to the current locale.
 */
export function formatNumber(value: number, options?: {style?: 'decimal' | 'currency' | 'percent'; currency?: string}): string {
  const localeData = getLocaleData();
  const localeCode = localeData.code;

  try {
    return new Intl.NumberFormat(localeCode === 'zh' ? 'zh-CN' : localeCode, {
      style: options?.style,
      currency: options?.currency,
    }).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Format a date according to the current locale.
 */
export function formatDate(date: Date, format?: 'short' | 'medium' | 'long' | 'relative'): string {
  if (format === 'relative') {
    return formatRelative(date);
  }

  const localeData = getLocaleData();
  const localeCode = localeData.code === 'zh' ? 'zh-CN' : localeData.code;

  const dateFormats: Record<string, Intl.DateTimeFormatOptions> = {
    short: {month: 'short', day: 'numeric'},
    medium: {month: 'short', day: 'numeric', year: 'numeric'},
    long: {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'},
  };

  try {
    return new Intl.DateTimeFormat(localeCode, dateFormats[format ?? 'medium']).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

/**
 * Format relative time ("2 hours ago", "in 3 days").
 */
export function formatRelative(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const absDiff = Math.abs(diff);

  const localeCode = getLocaleData().code;

  const rtf = new Intl.RelativeTimeFormat(localeCode === 'zh' ? 'zh-CN' : localeCode, {numeric: 'auto'});

  if (absDiff < 60000) return rtf.format(0, 'second');
  if (absDiff < 3600000) return rtf.format(-Math.round(diff / 60000), 'minute');
  if (absDiff < 86400000) return rtf.format(-Math.round(diff / 3600000), 'hour');
  if (absDiff < 604800000) return rtf.format(-Math.round(diff / 86400000), 'day');
  if (absDiff < 2592000000) return rtf.format(-Math.round(diff / 604800000), 'week');
  return rtf.format(-Math.round(diff / 2592000000), 'month');
}

/**
 * Format a file size with locale-aware number formatting.
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${formatNumber(Math.round(size * 10) / 10)} ${units[unitIndex]}`;
}

/**
 * Format a distance with locale-aware number formatting.
 */
export function formatDistance(meters: number): string {
  const localeData = getLocaleData();

  // Use imperial for US locale, metric for everything else
  if (localeData.code === 'en') {
    const miles = meters / 1609.34;
    return miles < 0.1 ? `${formatNumber(Math.round(meters * 3.281))} ft` : `${formatNumber(Math.round(miles * 10) / 10)} mi`;
  }

  return meters < 1000 ? `${formatNumber(Math.round(meters))} m` : `${formatNumber(Math.round(meters / 100) / 10)} km`;
}
