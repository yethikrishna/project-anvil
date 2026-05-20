/**
 * English locale — default
 */

import type {LocaleData} from '../index.js';

export const en: LocaleData = {
  code: 'en',
  name: 'English',
  rtl: false,
  dateFormat: 'MM/DD/YYYY',
  timeFormat: 'h:mm A',
  numberFormat: {decimal: '.', thousands: ','},
  messages: {
    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.create': 'Create',
    'common.search': 'Search',
    'common.upload': 'Upload',
    'common.download': 'Download',
    'common.share': 'Share',
    'common.close': 'Close',
    'common.loading': 'Loading...',
    'common.error': 'Something went wrong',
    'common.retry': 'Retry',
    'common.confirm': 'Confirm',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.previous': 'Previous',
    'common.more': 'More',

    // Drive
    'drive.title': 'Drive',
    'drive.myFiles': 'My Files',
    'drive.shared': 'Shared with me',
    'drive.recent': 'Recent',
    'drive.starred': 'Starred',
    'drive.trash': 'Trash',
    'drive.newFolder': 'New folder',
    'drive.uploadFiles': 'Upload files',
    'drive.noFiles': 'No files here',
    'drive.fileCount': '{{count}} files',
    'drive.storageUsed': '{{used}} of {{total}} used',

    // Docs
    'docs.title': 'Docs',
    'docs.newDoc': 'New document',
    'docs.blankDoc': 'Blank document',
    'docs.fromTemplate': 'From template',
    'docs.sharing': '{{count}} people viewing',
    'docs.autoSaving': 'Saving...',
    'docs.saved': 'Saved',
    'docs.export': 'Export',
    'docs.exportPdf': 'Export as PDF',
    'docs.exportDocx': 'Export as DOCX',

    // Gmail
    'gmail.title': 'Mail',
    'gmail.inbox': 'Inbox',
    'gmail.sent': 'Sent',
    'gmail.drafts': 'Drafts',
    'gmail.spam': 'Spam',
    'gmail.trash': 'Trash',
    'gmail.compose': 'Compose',
    'gmail.reply': 'Reply',
    'gmail.replyAll': 'Reply all',
    'gmail.forward': 'Forward',
    'gmail.archive': 'Archive',
    'gmail.star': 'Star',
    'gmail.unread': '{{count}} unread',
    'gmail.noMessages': 'No messages',

    // YouTube
    'youtube.title': 'Video',
    'youtube.search': 'Search videos',
    'youtube.subscriptions': 'Subscriptions',
    'youtube.history': 'History',
    'youtube.watchLater': 'Watch later',
    'youtube.liked': 'Liked videos',
    'youtube.transcript': 'Transcript',
    'youtube.related': 'Related videos',

    // Maps
    'maps.title': 'Maps',
    'maps.search': 'Search maps',
    'maps.directions': 'Directions',
    'maps.myLocation': 'My location',
    'maps.distance': '{{distance}} away',
    'maps.duration': '{{time}} drive',

    // Search
    'search.title': 'Search',
    'search.placeholder': 'Search the web',
    'search.results': '{{count}} results',
    'search.noResults': 'No results found',
    'search.images': 'Images',
    'search.web': 'Web',
    'search.suggestion': 'Did you mean: {{query}}?',

    // Calendar
    'calendar.title': 'Calendar',
    'calendar.today': 'Today',
    'calendar.week': 'Week',
    'calendar.month': 'Month',
    'calendar.day': 'Day',
    'calendar.newEvent': 'New event',
    'calendar.allDay': 'All day',
    'calendar.repeats': 'Repeats',

    // Marketplace
    'marketplace.title': 'Plugins',
    'marketplace.search': 'Search plugins',
    'marketplace.install': 'Install',
    'marketplace.installed': 'Installed',
    'marketplace.uninstall': 'Uninstall',
    'marketplace.featured': 'Featured',

    // Admin
    'admin.title': 'Admin',
    'admin.users': 'Users',
    'admin.analytics': 'Analytics',
    'admin.audit': 'Audit Log',
    'admin.apiKeys': 'API Keys',
    'admin.settings': 'Settings',
  },
};
