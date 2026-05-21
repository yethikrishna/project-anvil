/**
 * POST /api/voice/stt — Speech-to-text.
 *
 * Primary: OpenAI Whisper API
 * Fallback: Local Whisper.cpp (if WHISPER_LOCAL_URL is set)
 *
 * Accepts: multipart/form-data with audio blob
 * Returns: { text: string, language?: string, duration?: number }
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audioBlob = formData.get('audio') as Blob | null;
  const language = formData.get('language') as string | null;

  if (!audioBlob) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
  }

  // Try local Whisper first if configured
  const localWhisperUrl = process.env.WHISPER_LOCAL_URL;
  if (localWhisperUrl) {
    try {
      const localRes = await fetch(`${localWhisperUrl}/inference`, {
        method: 'POST',
        body: formData,
      });

      if (localRes.ok) {
        const data = await localRes.json();
        return NextResponse.json({
          text: data.text ?? data.transcription ?? '',
          language: data.language,
          source: 'local-whisper',
        });
      }
    } catch {
      // Local whisper unavailable, fall through to API
    }
  }

  // OpenAI Whisper API
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key configured for speech recognition' }, { status: 500 });
  }

  const whisperForm = new FormData();
  whisperForm.append('file', audioBlob, 'recording.webm');
  whisperForm.append('model', 'whisper-1');
  if (language) whisperForm.append('language', language);
  whisperForm.append('response_format', 'verbose_json');

  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Whisper API error: ${res.status}`, details: errText },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json({
      text: data.text ?? '',
      language: data.language,
      duration: data.duration,
      source: 'openai-whisper',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Speech recognition failed' },
      { status: 500 },
    );
  }
}
