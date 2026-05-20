/**
 * Hindi locale
 */

import type {LocaleData} from '../index.js';

export const hi: LocaleData = {
  code: 'hi',
  name: 'हिन्दी',
  rtl: false,
  dateFormat: 'DD/MM/YYYY',
  timeFormat: 'h:mm A',
  numberFormat: {decimal: '.', thousands: ','},
  messages: {
    'common.save': 'सहेजें',
    'common.cancel': 'रद्द करें',
    'common.delete': 'हटाएं',
    'common.edit': 'संपादित करें',
    'common.create': 'बनाएं',
    'common.search': 'खोजें',
    'common.upload': 'अपलोड',
    'common.download': 'डाउनलोड',
    'common.share': 'साझा करें',
    'common.close': 'बंद करें',
    'common.loading': 'लोड हो रहा है...',
    'common.error': 'कुछ गलत हो गया',
    'common.retry': 'पुनः प्रयास',
    'common.back': 'वापस',
    'common.next': 'अगला',
    'common.more': 'और',

    'drive.title': 'ड्राइव',
    'drive.myFiles': 'मेरी फ़ाइलें',
    'drive.shared': 'मेरे साथ साझा किया गया',
    'drive.recent': 'हाल ही में',
    'drive.uploadFiles': 'फ़ाइलें अपलोड करें',
    'drive.storageUsed': '{{used}} / {{total}} उपयोग',

    'docs.title': 'दस्तावेज़',
    'docs.newDoc': 'नया दस्तावेज़',
    'docs.saved': 'सहेजा गया',

    'gmail.title': 'मेल',
    'gmail.inbox': 'इनबॉक्स',
    'gmail.sent': 'भेजे गए',
    'gmail.compose': 'लिखें',
    'gmail.unread': '{{count}} अनपढ़',

    'youtube.title': 'वीडियो',
    'maps.title': 'मैप्स',
    'search.title': 'खोज',
    'search.placeholder': 'वेब खोजें',
    'calendar.title': 'कैलेंडर',
    'marketplace.title': 'प्लगइन',
    'admin.title': 'एडमिन',
  },
};
