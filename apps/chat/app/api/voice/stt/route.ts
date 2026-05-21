/**
 * POST /api/voice/stt — Speech-to-text via Whisper API.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audioBlob = formData.get('audio') as Blob | null;

  if (!audioBlob) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
  }

  // Forward to Whisper API
  const whisperForm = new FormData();
  whisperForm.append('file', audioBlob, 'recording.webm');
  whisperForm.append('model', 'whisper-1');
  whisperForm.append('language', 'en');
  whisperForm.append('response_format', 'json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: whisperForm,
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Whisper API error: ${res.status}` }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json({ text: data.text });
}
