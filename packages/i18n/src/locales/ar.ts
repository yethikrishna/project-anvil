/**
 * Arabic locale (RTL)
 */

import type {LocaleData} from '../index.js';

export const ar: LocaleData = {
  code: 'ar',
  name: 'العربية',
  rtl: true,
  dateFormat: 'DD/MM/YYYY',
  timeFormat: 'h:mm A',
  numberFormat: {decimal: '.', thousands: ','},
  messages: {
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.delete': 'حذف',
    'common.edit': 'تحرير',
    'common.create': 'إنشاء',
    'common.search': 'بحث',
    'common.upload': 'رفع',
    'common.download': 'تنزيل',
    'common.share': 'مشاركة',
    'common.close': 'إغلاق',
    'common.loading': 'جارٍ التحميل...',
    'common.error': 'حدث خطأ',
    'common.back': 'رجوع',
    'common.more': 'المزيد',

    'drive.title': 'الDrive',
    'drive.myFiles': 'ملفاتي',
    'drive.shared': 'تمت المشاركة معي',
    'drive.uploadFiles': 'رفع ملفات',

    'docs.title': 'المستندات',
    'docs.newDoc': 'مستند جديد',

    'gmail.title': 'البريد',
    'gmail.inbox': 'البريد الوارد',
    'gmail.compose': 'إنشاء',

    'youtube.title': 'الفيديو',
    'maps.title': 'الخرائط',
    'search.title': 'البحث',
    'search.placeholder': 'البحث في الويب',
    'calendar.title': 'التقويم',
    'marketplace.title': 'الإضافات',
    'admin.title': 'الإدارة',
  },
};
