'use client';

/**
 * AI-powered file tagging for Drive
 *
 * Automatically tags files based on:
 * - MIME type analysis
 * - Filename pattern matching
 * - Content type inference
 * - Size-based classification
 */

// ── Types ──

export type FileTag =
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'code'
  | 'data'
  | 'font'
  | 'pdf'
  | 'design'
  | 'confidential'
  | 'shared'
  | 'backup'
  | 'temp'
  | 'large-file';

export interface TagResult {
  tags: FileTag[];
  confidence: Record<FileTag, number>;
  suggestedFolder?: string;
  description?: string;
}

// ── Tag Rules ──

const MIME_TAG_MAP: Record<string, FileTag[]> = {
  'application/pdf': ['pdf', 'document'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['document'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['spreadsheet', 'data'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['presentation'],
  'application/vnd.google-apps.document': ['document'],
  'application/vnd.google-apps.spreadsheet': ['spreadsheet', 'data'],
  'application/vnd.google-apps.presentation': ['presentation'],
  'text/plain': ['document'],
  'text/csv': ['data', 'spreadsheet'],
  'text/markdown': ['document', 'code'],
  'application/json': ['data', 'code'],
  'application/xml': ['data', 'code'],
  'text/html': ['code'],
  'text/css': ['code'],
  'text/javascript': ['code'],
  'application/javascript': ['code'],
  'application/typescript': ['code'],
  'application/x-python': ['code'],
  'image/png': ['image'],
  'image/jpeg': ['image'],
  'image/gif': ['image'],
  'image/webp': ['image'],
  'image/svg+xml': ['image', 'design'],
  'image/psd': ['design'],
  'image/xd': ['design'],
  'image/fig': ['design'],
  'video/mp4': ['video'],
  'video/webm': ['video'],
  'video/quicktime': ['video'],
  'audio/mpeg': ['audio'],
  'audio/wav': ['audio'],
  'audio/ogg': ['audio'],
  'application/zip': ['archive'],
  'application/x-tar': ['archive'],
  'application/gzip': ['archive'],
  'application/x-rar-compressed': ['archive'],
  'application/font-woff': ['font'],
  'application/font-woff2': ['font'],
  'font/ttf': ['font'],
  'font/otf': ['font'],
};

const EXTENSION_TAG_MAP: Record<string, FileTag[]> = {
  '.pdf': ['pdf', 'document'],
  '.doc': ['document'], '.docx': ['document'],
  '.xls': ['spreadsheet', 'data'], '.xlsx': ['spreadsheet', 'data'],
  '.ppt': ['presentation'], '.pptx': ['presentation'],
  '.txt': ['document'], '.md': ['document', 'code'], '.rst': ['document'],
  '.csv': ['data', 'spreadsheet'],
  '.json': ['data', 'code'], '.xml': ['data', 'code'], '.yaml': ['data', 'code'], '.yml': ['data', 'code'],
  '.html': ['code'], '.css': ['code'], '.scss': ['code'], '.less': ['code'],
  '.js': ['code'], '.jsx': ['code'], '.ts': ['code'], '.tsx': ['code'],
  '.py': ['code'], '.rb': ['code'], '.go': ['code'], '.rs': ['code'],
  '.java': ['code'], '.kt': ['code'], '.swift': ['code'],
  '.png': ['image'], '.jpg': ['image'], '.jpeg': ['image'],
  '.gif': ['image'], '.webp': ['image'], '.svg': ['image', 'design'],
  '.psd': ['design'], '.sketch': ['design'], '.fig': ['design'],
  '.mp4': ['video'], '.mov': ['video'], '.avi': ['video'], '.webm': ['video'],
  '.mp3': ['audio'], '.wav': ['audio'], '.flac': ['audio'], '.ogg': ['audio'],
  '.zip': ['archive'], '.tar': ['archive'], '.gz': ['archive'], '.rar': ['archive'],
  '.woff': ['font'], '.woff2': ['font'], '.ttf': ['font'], '.otf': ['font'],
  '.sql': ['data', 'code'], '.db': ['data'], '.sqlite': ['data'],
};

const CONFIDENTIAL_PATTERNS = [
  /confidential/i, /internal/i, /private/i, /secret/i,
  /salary/i, /compensation/i, /ssn/i, /password/i,
  /credential/i, /key\./i, /\.pem$/i, /\.key$/i,
  /contract/i, /nda/i, /legal/i, /audit/i,
];

const BACKUP_PATTERNS = [
  /backup/i, /\.bak$/i, /\.old$/i, /\.copy$/i,
  /\d{4}-\d{2}-\d{2}.*copy/i, /_v\d+/i,
];

const TEMP_PATTERNS = [
  /temp/i, /tmp/i, /\.tmp$/i, /\.temp$/i,
  /untitled/i, /draft/i, /wip/i,
];

// ── Classifier ──

export function tagFile(file: {
  name: string;
  mimeType: string | null;
  size: number;
  isDirectory: boolean;
}): TagResult {
  const tags: FileTag[] = [];
  const confidence: Record<FileTag, number> = {} as any;
  let suggestedFolder: string | undefined;
  let description: string | undefined;

  // Initialize confidence
  const allTags: FileTag[] = ['document', 'spreadsheet', 'presentation', 'image', 'video', 'audio', 'archive', 'code', 'data', 'font', 'pdf', 'design', 'confidential', 'shared', 'backup', 'temp', 'large-file'];
  for (const t of allTags) confidence[t] = 0;

  // Skip directories
  if (file.isDirectory) {
    return { tags: [], confidence, suggestedFolder: file.name, description: 'Directory' };
  }

  // MIME type matching
  if (file.mimeType) {
    const mimeTags = MIME_TAG_MAP[file.mimeType];
    if (mimeTags) {
      for (const tag of mimeTags) {
        tags.push(tag);
        confidence[tag] = Math.max(confidence[tag], 0.9);
      }
    }

    // Check prefix matches for MIME types
    if (file.mimeType.startsWith('image/')) {
      if (!tags.includes('image')) tags.push('image');
      confidence.image = Math.max(confidence.image, 0.8);
    }
    if (file.mimeType.startsWith('video/')) {
      if (!tags.includes('video')) tags.push('video');
      confidence.video = Math.max(confidence.video, 0.8);
    }
    if (file.mimeType.startsWith('audio/')) {
      if (!tags.includes('audio')) tags.push('audio');
      confidence.audio = Math.max(confidence.audio, 0.8);
    }
    if (file.mimeType.startsWith('text/')) {
      if (!tags.includes('code')) tags.push('code');
      confidence.code = Math.max(confidence.code, 0.6);
    }
  }

  // Extension matching
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  const extTags = EXTENSION_TAG_MAP[ext];
  if (extTags) {
    for (const tag of extTags) {
      if (!tags.includes(tag)) tags.push(tag);
      confidence[tag] = Math.max(confidence[tag], 0.85);
    }
  }

  // Confidentiality detection
  if (CONFIDENTIAL_PATTERNS.some(p => p.test(file.name))) {
    tags.push('confidential');
    confidence.confidential = 0.8;
  }

  // Backup detection
  if (BACKUP_PATTERNS.some(p => p.test(file.name))) {
    tags.push('backup');
    confidence.backup = 0.7;
    suggestedFolder = 'Backups';
  }

  // Temp file detection
  if (TEMP_PATTERNS.some(p => p.test(file.name))) {
    tags.push('temp');
    confidence.temp = 0.7;
  }

  // Large file detection (>100MB)
  if (file.size > 100 * 1024 * 1024) {
    tags.push('large-file');
    confidence['large-file'] = 0.9;
    description = `Large file (${(file.size / (1024 * 1024)).toFixed(0)} MB)`;
  } else if (file.size > 50 * 1024 * 1024) {
    confidence['large-file'] = 0.5;
  }

  // Suggest folder based on primary tag
  if (!suggestedFolder && tags.length > 0) {
    const folderMap: Record<string, string> = {
      document: 'Documents',
      spreadsheet: 'Spreadsheets',
      presentation: 'Presentations',
      image: 'Images',
      video: 'Videos',
      audio: 'Audio',
      code: 'Code',
      design: 'Design',
      pdf: 'Documents',
      data: 'Data',
      archive: 'Archives',
    };
    for (const tag of tags) {
      if (folderMap[tag]) {
        suggestedFolder = folderMap[tag];
        break;
      }
    }
  }

  // Generate description
  if (!description && tags.length > 0) {
    const primaryTag = tags[0];
    const descriptions: Record<string, string> = {
      document: 'Text document',
      spreadsheet: 'Spreadsheet file',
      presentation: 'Presentation file',
      image: 'Image file',
      video: 'Video file',
      audio: 'Audio file',
      code: 'Source code file',
      data: 'Data file',
      font: 'Font file',
      pdf: 'PDF document',
      design: 'Design file',
      archive: 'Compressed archive',
    };
    description = descriptions[primaryTag] ?? undefined;
  }

  // Remove duplicates
  const uniqueTags = [...new Set(tags)];

  return { tags: uniqueTags, confidence, suggestedFolder, description };
}

// ── Tag Display Helpers ──

export const TAG_CONFIG: Record<FileTag, { label: string; color: string; icon: string }> = {
  document: { label: 'Document', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: '📄' },
  spreadsheet: { label: 'Spreadsheet', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: '📊' },
  presentation: { label: 'Presentation', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: '📽️' },
  image: { label: 'Image', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: '🖼️' },
  video: { label: 'Video', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: '🎬' },
  audio: { label: 'Audio', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400', icon: '🎵' },
  archive: { label: 'Archive', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: '📦' },
  code: { label: 'Code', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400', icon: '💻' },
  data: { label: 'Data', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400', icon: '🔢' },
  font: { label: 'Font', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', icon: '🔤' },
  pdf: { label: 'PDF', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: '📕' },
  design: { label: 'Design', color: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400', icon: '🎨' },
  confidential: { label: 'Confidential', color: 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300', icon: '🔒' },
  shared: { label: 'Shared', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400', icon: '👥' },
  backup: { label: 'Backup', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400', icon: '💾' },
  temp: { label: 'Temp', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: '⏳' },
  'large-file': { label: 'Large', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400', icon: '📦' },
};
