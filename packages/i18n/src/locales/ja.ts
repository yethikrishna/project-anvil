/**
 * Japanese locale
 */

import type {LocaleData} from '../index.js';

export const ja: LocaleData = {
  code: 'ja',
  name: '日本語',
  rtl: false,
  dateFormat: 'YYYY/MM/DD',
  timeFormat: 'H:mm',
  numberFormat: {decimal: '.', thousands: ','},
  messages: {
    'common.save': '保存',
    'common.cancel': 'キャンセル',
    'common.delete': '削除',
    'common.edit': '編集',
    'common.create': '作成',
    'common.search': '検索',
    'common.upload': 'アップロード',
    'common.download': 'ダウンロード',
    'common.share': '共有',
    'common.close': '閉じる',
    'common.loading': '読み込み中...',
    'common.error': 'エラーが発生しました',
    'common.back': '戻る',
    'common.more': 'もっと',

    'drive.title': 'ドライブ',
    'drive.myFiles': 'マイファイル',
    'drive.shared': '共有アイテム',
    'drive.uploadFiles': 'ファイルをアップロード',
    'drive.storageUsed': '{{used}} / {{total}} 使用中',

    'docs.title': 'ドキュメント',
    'docs.newDoc': '新しいドキュメント',
    'docs.saved': '保存しました',

    'gmail.title': 'メール',
    'gmail.inbox': '受信トレイ',
    'gmail.sent': '送信済み',
    'gmail.compose': '作成',

    'youtube.title': 'ビデオ',
    'maps.title': 'マップ',
    'search.title': '検索',
    'search.placeholder': 'ウェブを検索',
    'calendar.title': 'カレンダー',
    'marketplace.title': 'プラグイン',
    'admin.title': '管理',
  },
};
