/**
 * POST /api/voice/tts — Text-to-speech via OpenAI TTS API.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { text, voice = 'nova' } = await req.json();

  if (!text) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
  }

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice,
      response_format: 'mp3',
      speed: 1.0,
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: `TTS API error: ${res.status}` }, { status: res.status });
  }

  // Stream the audio back
  const audioBuffer = await res.arrayBuffer();
  return new Response(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audioBuffer.byteLength),
    },
  });
}
