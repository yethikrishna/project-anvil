/**
 * YouTube API client — uses RapidAPI YouTube Search + Data API
 *
 * Provides search, video details, and related videos.
 */

import axios from 'axios';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? process.env.NEXT_PUBLIC_RAPIDAPI_KEY ?? '';
const RAPIDAPI_HOST = 'youtube-data8.p.rapidapi.com';

const api = axios.create({
  baseURL: `https://${RAPIDAPI_HOST}`,
  headers: {
    'X-RapidAPI-Key': RAPIDAPI_KEY,
    'X-RapidAPI-Host': RAPIDAPI_HOST,
  },
  timeout: 10000,
});

export interface VideoResult {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channel: string;
  channelId: string;
  views: string;
  duration: string;
  publishedAt: string;
}

export interface VideoDetails {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channel: string;
  channelId: string;
  views: string;
  likes: string;
  duration: string;
  publishedAt: string;
  tags: string[];
}

// Search videos
export async function searchVideos(query: string, limit = 20): Promise<VideoResult[]> {
  if (!query.trim()) return [];

  try {
    const resp = await api.get('/search', {
      params: {q: query, hl: 'en', gl: 'US'},
    });

    const items = resp.data?.contents ?? resp.data?.items ?? [];
    return items.map((item: any) => ({
      id: item.video?.videoId ?? item.id?.videoId ?? '',
      title: item.video?.title ?? item.snippet?.title ?? '',
      description: item.video?.description ?? item.snippet?.description ?? '',
      thumbnail: item.video?.thumbnails?.[0]?.url ?? item.snippet?.thumbnails?.medium?.url ?? '',
      channel: item.video?.channelTitle ?? item.snippet?.channelTitle ?? '',
      channelId: item.video?.channelId ?? item.snippet?.channelId ?? '',
      views: item.video?.viewCount ?? item.statistics?.viewCount ?? '',
      duration: item.video?.lengthSeconds ? formatDuration(item.video.lengthSeconds) : '',
      publishedAt: item.video?.publishedTime ?? item.snippet?.publishedAt ?? '',
    })).filter((v: VideoResult) => v.id);
  } catch (err) {
    console.error('Search failed:', err);
    return [];
  }
}

// Get video details
export async function getVideoDetails(videoId: string): Promise<VideoDetails | null> {
  try {
    const resp = await api.get('/video/details', {
      params: {id: videoId, hl: 'en', gl: 'US'},
    });

    const data = resp.data;
    return {
      id: data.videoId ?? videoId,
      title: data.title ?? '',
      description: data.description ?? '',
      thumbnail: data.thumbnail?.[0]?.url ?? data.thumbnails?.[0]?.url ?? '',
      channel: data.channelTitle ?? '',
      channelId: data.channelId ?? '',
      views: data.viewCount ?? '',
      likes: data.likeCount ?? '',
      duration: data.lengthSeconds ? formatDuration(data.lengthSeconds) : '',
      publishedAt: data.publishDate ?? '',
      tags: data.keywords ?? [],
    };
  } catch {
    return null;
  }
}

// Get related videos
export async function getRelatedVideos(videoId: string, limit = 10): Promise<VideoResult[]> {
  try {
    const resp = await api.get('/video/related', {
      params: {id: videoId, hl: 'en', gl: 'US'},
    });

    const items = resp.data?.contents ?? resp.data?.items ?? [];
    return items.slice(0, limit).map((item: any) => ({
      id: item.video?.videoId ?? item.id?.videoId ?? '',
      title: item.video?.title ?? item.snippet?.title ?? '',
      description: '',
      thumbnail: item.video?.thumbnails?.[0]?.url ?? item.snippet?.thumbnails?.medium?.url ?? '',
      channel: item.video?.channelTitle ?? item.snippet?.channelTitle ?? '',
      channelId: item.video?.channelId ?? item.snippet?.channelId ?? '',
      views: item.video?.viewCount ?? '',
      duration: item.video?.lengthSeconds ? formatDuration(item.video.lengthSeconds) : '',
      publishedAt: item.video?.publishedTime ?? '',
    })).filter((v: VideoResult) => v.id);
  } catch {
    return [];
  }
}

// Get autocomplete suggestions
export async function getSearchSuggestions(query: string): Promise<string[]> {
  if (!query.trim()) return [];

  try {
    const resp = await api.get('/search/suggestions', {
      params: {q: query},
    });
    return resp.data?.suggestions ?? resp.data ?? [];
  } catch {
    return [];
  }
}

// Format duration from seconds to MM:SS or HH:MM:SS
function formatDuration(seconds: number | string): string {
  const s = typeof seconds === 'string' ? parseInt(seconds) : seconds;
  if (isNaN(s)) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
