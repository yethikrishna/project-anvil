/**
 * YouTube Transcript Fetcher
 *
 * Fetches video transcripts/captions using the YouTube Data API
 * via RapidAPI, with a fallback to the html-encoded auto-captions.
 *
 * Returns timestamped transcript lines for in-video search.
 */

import axios from 'axios';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? process.env.NEXT_PUBLIC_RAPIDAPI_KEY ?? '';

export interface TranscriptLine {
  text: string;
  startSeconds: number;
  duration: number;
}

/**
 * Fetch transcript for a YouTube video.
 *
 * Strategy:
 * 1. Try the RapidAPI YouTube transcript endpoint
 * 2. Fallback: return an empty array (graceful degradation)
 */
export async function getVideoTranscript(videoId: string): Promise<TranscriptLine[]> {
  // Strategy 1: RapidAPI YouTube Data8 transcript endpoint
  try {
    const resp = await axios.get('https://youtube-data8.p.rapidapi.com/video/transcripts', {
      params: {id: videoId},
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'youtube-data8.p.rapidapi.com',
      },
      timeout: 8000,
    });

    const data = resp.data;

    // Parse transcript data — format varies by API
    if (Array.isArray(data)) {
      return data.map((item: any) => ({
        text: cleanText(item.text ?? item.content ?? ''),
        startSeconds: parseFloat(item.start ?? item.offset ?? 0),
        duration: parseFloat(item.dur ?? item.duration ?? 2),
      }));
    }

    // Some APIs return {transcript: [...]}
    if (data?.transcript && Array.isArray(data.transcript)) {
      return data.transcript.map((item: any) => ({
        text: cleanText(item.text ?? ''),
        startSeconds: parseFloat(item.start ?? 0),
        duration: parseFloat(item.dur ?? 2),
      }));
    }

    // Some APIs return {contents: [...]}
    if (data?.contents && Array.isArray(data.contents)) {
      return data.contents
        .filter((item: any) => item.type === 'transcriptLine' || item.text)
        .map((item: any) => ({
          text: cleanText(item.text ?? ''),
          startSeconds: parseFloat(item.start ?? item.startSeconds ?? 0),
          duration: parseFloat(item.dur ?? item.duration ?? 2),
        }));
    }
  } catch (err: any) {
    // Only log if not a 404 (transcript not available)
    if (err?.response?.status !== 404) {
      console.error('Transcript fetch failed:', err?.message);
    }
  }

  // Strategy 2: Try alternative YouTube captions endpoint
  try {
    const resp = await axios.get('https://youtube-data8.p.rapidapi.com/video/captions', {
      params: {id: videoId},
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'youtube-data8.p.rapidapi.com',
      },
      timeout: 8000,
    });

    const captions = resp.data?.captions ?? resp.data;
    if (Array.isArray(captions)) {
      return captions.map((item: any) => ({
        text: cleanText(item.text ?? item.content ?? ''),
        startSeconds: parseFloat(item.start ?? 0),
        duration: parseFloat(item.dur ?? 2),
      }));
    }
  } catch {
    // Silently fail
  }

  // No transcript available
  return [];
}

/**
 * Search within transcript lines.
 * Returns matching lines with context (surrounding lines).
 */
export function searchTranscript(
  lines: TranscriptLine[],
  query: string
): {line: TranscriptLine; index: number}[] {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();
  const words = lowerQuery.split(/\s+/).filter(Boolean);

  return lines
    .map((line, index) => ({line, index}))
    .filter(({line}) => {
      const lowerText = line.text.toLowerCase();
      // All query words must be present (AND search)
      return words.every(word => lowerText.includes(word));
    });
}

/**
 * Format seconds to MM:SS or HH:MM:SS for display.
 */
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Clean HTML entities and tags from transcript text.
 */
function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')          // Remove HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}
