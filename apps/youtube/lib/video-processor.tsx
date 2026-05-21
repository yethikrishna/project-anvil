'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

type ProcessingMode = 'trim' | 'compress' | 'convert';

interface VideoProcessorProps {
  file: File;
  onComplete: (processedFile: File, metadata: { duration: number; size: number }) => void;
  onCancel: () => void;
}

interface ProcessingProgress {
  stage: 'loading' | 'processing' | 'done' | 'error';
  percent: number;
  message: string;
}

const MAX_FILE_SIZE_MB = 100;

export function VideoProcessor({ file, onComplete, onCancel }: VideoProcessorProps) {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress>({
    stage: 'loading',
    percent: 0,
    message: 'Loading FFmpeg...',
  });
  const [mode, setMode] = useState<ProcessingMode>('compress');
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load FFmpeg WASM
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('progress', ({ progress }) => {
        if (!cancelled) {
          setProgress(prev => ({
            ...prev,
            percent: Math.round(progress * 100),
            message: `Processing... ${Math.round(progress * 100)}%`,
          }));
        }
      });

      ffmpeg.on('log', ({ message: msg }) => {
        // Parse duration from FFmpeg output
        const durMatch = msg.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (durMatch && !cancelled) {
          const d = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
          setDuration(d);
          setTrimEnd(d);
        }
      });

      try {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        if (!cancelled) {
          setLoaded(true);
          setProgress({ stage: 'processing', percent: 0, message: 'Ready' });
        }
      } catch (err) {
        if (!cancelled) {
          setProgress({
            stage: 'error',
            percent: 0,
            message: `Failed to load FFmpeg: ${err instanceof Error ? err.message : 'Unknown error'}`,
          });
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  // Create video preview URL
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Format seconds to MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Format bytes to MB
  const formatSize = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

  // Process video
  const processVideo = useCallback(async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg || !loaded) return;

    const inputName = 'input' + getExtension(file.name);
    const outputName = 'output.mp4';

    setProgress({ stage: 'processing', percent: 0, message: 'Reading file...' });

    try {
      // Write input file
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      let args: string[] = [];

      switch (mode) {
        case 'trim':
          args = [
            '-ss', trimStart.toString(),
            '-i', inputName,
            '-to', (trimEnd - trimStart).toString(),
            '-c', 'copy',
            outputName,
          ];
          break;

        case 'compress':
          args = [
            '-i', inputName,
            '-c:v', 'libx264',
            '-crf', '28',
            '-preset', 'fast',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            outputName,
          ];
          break;

        case 'convert':
          args = [
            '-i', inputName,
            '-c:v', 'libx264',
            '-crf', '23',
            '-preset', 'fast',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-vf', 'scale=-2:720',
            '-movflags', '+faststart',
            outputName,
          ];
          break;
      }

      setProgress({ stage: 'processing', percent: 10, message: 'Processing video...' });
      await ffmpeg.exec(args);

      // Read output
      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
      const processedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.mp4'), {
        type: 'video/mp4',
      });

      // Cleanup
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);

      setProgress({ stage: 'done', percent: 100, message: 'Done!' });
      onComplete(processedFile, {
        duration: mode === 'trim' ? trimEnd - trimStart : duration,
        size: processedFile.size,
      });
    } catch (err) {
      setProgress({
        stage: 'error',
        percent: 0,
        message: `Processing failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }
  }, [ffmpegRef, loaded, mode, trimStart, trimEnd, duration, file, onComplete]);

  const fileSizeMB = file.size / (1024 * 1024);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Video Preprocessor
            </h3>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {file.name} ({formatSize(file.size)} MB)
          </p>
        </div>

        {/* Video Preview */}
        <div className="px-6 py-3">
          {videoUrl && (
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full rounded-lg bg-black max-h-40 object-contain"
              controls
              muted
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  const d = videoRef.current.duration;
                  setDuration(d);
                  setTrimEnd(d);
                }
              }}
            />
          )}
        </div>

        {/* Mode Tabs */}
        <div className="px-6">
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {(['compress', 'trim', 'convert'] as ProcessingMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {m === 'compress' ? '📦 Compress' : m === 'trim' ? '✂️ Trim' : '🔄 Convert'}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Controls */}
        <div className="px-6 py-4">
          {mode === 'trim' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  Start: {formatTime(trimStart)}
                </label>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={trimStart}
                  onChange={e => setTrimStart(parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  End: {formatTime(trimEnd)}
                </label>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={trimEnd}
                  onChange={e => setTrimEnd(parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
              <p className="text-xs text-gray-400">
                Duration: {formatTime(trimEnd - trimStart)}
              </p>
            </div>
          )}

          {mode === 'compress' && (
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <p>Reduces file size using H.264 compression (CRF 28).</p>
              <p>Output: MP4 with fast-start for web streaming.</p>
              {fileSizeMB > MAX_FILE_SIZE_MB && (
                <p className="text-amber-600">
                  Large file ({formatSize(file.size)} MB) — compression recommended.
                </p>
              )}
            </div>
          )}

          {mode === 'convert' && (
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <p>Converts to web-friendly MP4 (H.264 + AAC).</p>
              <p>Output: 720p resolution, optimized for streaming.</p>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {(progress.stage === 'loading' || progress.stage === 'processing') && (
          <div className="px-6 pb-2">
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{progress.message}</p>
          </div>
        )}

        {progress.stage === 'error' && (
          <div className="px-6 pb-2">
            <p className="text-sm text-red-600">{progress.message}</p>
          </div>
        )}

        {progress.stage === 'done' && (
          <div className="px-6 pb-2">
            <p className="text-sm text-green-600">✅ Processing complete!</p>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={processVideo}
            disabled={!loaded || progress.stage === 'processing' || progress.stage === 'done'}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {!loaded ? 'Loading FFmpeg...' :
             progress.stage === 'processing' ? 'Processing...' :
             progress.stage === 'done' ? 'Done' :
             mode === 'compress' ? 'Compress' :
             mode === 'trim' ? 'Trim Video' : 'Convert'}
          </button>
        </div>
      </div>
    </div>
  );
}

function getExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp4': return '.mp4';
    case 'webm': return '.webm';
    case 'mov': return '.mov';
    case 'avi': return '.avi';
    case 'mkv': return '.mkv';
    default: return '.mp4';
  }
}
