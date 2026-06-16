'use client';

/**
 * AudioVisualizer — Web Audio API waveform/frequency bars.
 *
 * Modes:
 * - 'waveform': oscilloscope-style wave
 * - 'bars': frequency bars (FFT)
 * - 'circle': radial bars for voice recording
 *
 * Usage:
 * <AudioVisualizer stream={mediaStream} mode="bars" color="#6366f1" />
 * <AudioVisualizer audioUrl="/path/to/file.mp3" mode="waveform" />
 */

import { useEffect, useRef, useCallback } from 'react';

interface AudioVisualizerProps {
  stream?: MediaStream | null;
  audioElement?: HTMLAudioElement | null;
  audioUrl?: string;
  mode?: 'waveform' | 'bars' | 'circle';
  color?: string;
  backgroundColor?: string;
  width?: number;
  height?: number;
  barCount?: number;
  className?: string;
  active?: boolean; // false = show flat line
}

export default function AudioVisualizer({
  stream,
  audioElement,
  audioUrl,
  mode = 'bars',
  color = '#6366f1',
  backgroundColor = 'transparent',
  width = 300,
  height = 60,
  barCount = 48,
  className = '',
  active = true,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);

  const cleanup = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (sourceRef.current) {
      try { (sourceRef.current as MediaStreamAudioSourceNode).disconnect(); } catch { /* ok */ }
    }
    // Don't close AudioContext — expensive to recreate
    analyserRef.current = null;
    sourceRef.current = null;
  }, []);

  const drawFlat = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (mode === 'bars') {
      const barW = canvas.width / barCount;
      const gap = Math.max(1, barW * 0.15);
      ctx.fillStyle = color + '40';
      for (let i = 0; i < barCount; i++) {
        const x = i * barW + gap / 2;
        const barHeight = 2;
        ctx.fillRect(x, canvas.height / 2 - barHeight / 2, barW - gap, barHeight);
      }
    } else if (mode === 'waveform') {
      ctx.strokeStyle = color + '60';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    }
  }, [mode, color, backgroundColor, barCount]);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (backgroundColor !== 'transparent') {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (mode === 'bars') {
        analyser.getByteFrequencyData(dataArray);
        const barW = canvas.width / barCount;
        const gap = Math.max(1, barW * 0.15);
        const step = Math.floor(bufferLength / barCount);

        for (let i = 0; i < barCount; i++) {
          const value = dataArray[i * step] / 255;
          const barHeight = Math.max(2, value * canvas.height * 0.9);
          const x = i * barW + gap / 2;
          const y = (canvas.height - barHeight) / 2;

          // Gradient per bar
          const grad = ctx.createLinearGradient(x, y, x, y + barHeight);
          grad.addColorStop(0, color + 'cc');
          grad.addColorStop(1, color + '44');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, y, barW - gap, barHeight, 2);
          ctx.fill();
        }
      } else if (mode === 'waveform') {
        analyser.getByteTimeDomainData(dataArray);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        const sliceW = canvas.width / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * canvas.height) / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceW;
        }
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      } else if (mode === 'circle') {
        analyser.getByteFrequencyData(dataArray);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const radius = Math.min(cx, cy) * 0.5;
        const step = Math.floor(bufferLength / barCount);

        for (let i = 0; i < barCount; i++) {
          const value = dataArray[i * step] / 255;
          const barH = value * radius * 0.8 + 2;
          const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;

          const x1 = cx + Math.cos(angle) * radius;
          const y1 = cy + Math.sin(angle) * radius;
          const x2 = cx + Math.cos(angle) * (radius + barH);
          const y2 = cy + Math.sin(angle) * (radius + barH);

          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1, (canvas.width / barCount) * 0.6);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        // Center circle
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.85, 0, Math.PI * 2);
        ctx.strokeStyle = color + '33';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    draw();
  }, [mode, color, backgroundColor, barCount]);

  useEffect(() => {
    if (!active) {
      cleanup();
      drawFlat();
      return;
    }

    const setup = async () => {
      cleanup();

      try {
        if (!contextRef.current || contextRef.current.state === 'closed') {
          contextRef.current = new AudioContext();
        }
        const audioCtx = contextRef.current;
        if (audioCtx.state === 'suspended') await audioCtx.resume();

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = mode === 'waveform' ? 2048 : 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        let source: AudioNode | null = null;

        if (stream) {
          source = audioCtx.createMediaStreamSource(stream);
        } else if (audioElement) {
          source = audioCtx.createMediaElementSource(audioElement);
          source.connect(audioCtx.destination); // pass through to speakers
        } else if (audioUrl) {
          const el = new Audio(audioUrl);
          el.crossOrigin = 'anonymous';
          source = audioCtx.createMediaElementSource(el);
          source.connect(audioCtx.destination);
          el.play();
        }

        if (source) {
          source.connect(analyser);
          sourceRef.current = source;
          drawFrame();
        } else {
          drawFlat();
        }
      } catch (err) {
        console.warn('[AudioVisualizer] Setup failed:', err);
        drawFlat();
      }
    };

    setup();

    return cleanup;
  }, [stream, audioElement, audioUrl, active, cleanup, drawFrame, drawFlat, mode]);

  // Redraw flat on resize / prop changes when not active
  useEffect(() => {
    if (!active) drawFlat();
  }, [active, drawFlat]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
