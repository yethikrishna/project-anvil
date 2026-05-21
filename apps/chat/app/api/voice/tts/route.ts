/**
 * POST /api/voice/tts — Text-to-speech.
 *
 * Supports:
 * - OpenAI TTS (tts-1, tts-1-hd)
 * - Multiple voices: alloy, echo, fable, onyx, nova, shimmer
 * - Speed control: 0.25 - 4.0
 * - Formats: mp3, opus, aac, flac, wav
 *
 * Returns: audio stream
 */

import { NextRequest, NextResponse } from 'next/server';

const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
const VALID_FORMATS = ['mp3', 'opus', 'aac', 'flac', 'wav'] as const;
type Voice = typeof VALID_VOICES[number];
type AudioFormat = typeof VALID_FORMATS[number];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { text, voice = 'nova', speed = 1.0, format = 'mp3', model = 'tts-1' } = body as {
    text: string;
    voice?: string;
    speed?: number;
    format?: string;
    model?: string;
  };

  if (!text) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 });
  }

  // Truncate very long text
  const truncatedText = text.slice(0, 4096);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key configured for text-to-speech' }, { status: 500 });
  }

  // Validate params
  const selectedVoice: Voice = VALID_VOICES.includes(voice as Voice) ? (voice as Voice) : 'nova';
  const selectedFormat: AudioFormat = VALID_FORMATS.includes(format as AudioFormat) ? (format as AudioFormat) : 'mp3';
  const clampedSpeed = Math.max(0.25, Math.min(4.0, Number(speed) || 1.0));

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model === 'tts-1-hd' ? 'tts-1-hd' : 'tts-1',
        input: truncatedText,
        voice: selectedVoice,
        response_format: selectedFormat,
        speed: clampedSpeed,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `TTS API error: ${res.status}`, details: errText },
        { status: res.status },
      );
    }

    const audioBuffer = await res.arrayBuffer();
    const contentTypeMap: Record<AudioFormat, string> = {
      mp3: 'audio/mpeg',
      opus: 'audio/opus',
      aac: 'audio/aac',
      flac: 'audio/flac',
      wav: 'audio/wav',
    };

    return new Response(audioBuffer, {
      headers: {
        'Content-Type': contentTypeMap[selectedFormat],
        'Content-Length': String(audioBuffer.byteLength),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Text-to-speech failed' },
      { status: 500 },
    );
  }
}
