/**
 * useVirtualBackground — TensorFlow.js body segmentation for virtual backgrounds.
 *
 * Uses @tensorflow-models/body-segmentation with the BodyPix or MediaPipe
 * Selfie Segmentation model to:
 * 1. Detect the person in the video frame
 * 2. Replace the background with a solid color, blur, or custom image
 *
 * Returns a processed canvas stream that can replace the camera track in WebRTC.
 *
 * Usage:
 * ```ts
 * const { processedStream, setBackground } = useVirtualBackground(rawStream);
 * // Then use processedStream instead of rawStream in RTCPeerConnection
 * ```
 *
 * Graceful degradation: if TF.js fails to load (old browser, no GPU),
 * returns the original stream unchanged.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export type BackgroundType =
  | { type: 'none' }
  | { type: 'blur'; radius: number }
  | { type: 'color'; color: string }
  | { type: 'image'; url: string };

interface UseVirtualBackgroundReturn {
  processedStream: MediaStream | null;
  isProcessing: boolean;
  background: BackgroundType;
  setBackground: (bg: BackgroundType) => void;
  error: string | null;
}

export function useVirtualBackground(
  inputStream: MediaStream | null,
  enabled = true,
): UseVirtualBackgroundReturn {
  const [background, setBackground] = useState<BackgroundType>({ type: 'blur', radius: 15 });
  const [processedStream, setProcessedStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const modelRef = useRef<unknown>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const bgRef = useRef<BackgroundType>(background);

  bgRef.current = background;

  // Load TF.js body segmentation model
  const loadModel = useCallback(async () => {
    try {
      // Dynamic import to avoid SSR issues and allow tree-shaking
      const [tf, bodySegmentation] = await Promise.all([
        import('@tensorflow/tfjs-core' as never).catch(() => null),
        import('@tensorflow-models/body-segmentation' as never).catch(() => null),
      ]);

      if (!tf || !bodySegmentation) {
        throw new Error('TensorFlow.js not available');
      }

      // Prefer WebGL backend
      try {
        await (tf as { setBackend: (b: string) => Promise<void> }).setBackend('webgl');
      } catch {
        await (tf as { setBackend: (b: string) => Promise<void> }).setBackend('cpu');
      }

      // Use MediaPipe Selfie Segmentation (fast, accurate, 35MB)
      const model = await (bodySegmentation as {
        createSegmenter: (
          arch: string,
          config: Record<string, unknown>
        ) => Promise<unknown>
      }).createSegmenter(
        'MediaPipeSelfieSegmentation',
        {
          runtime: 'tfjs',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation',
          modelType: 'general',
        },
      );

      modelRef.current = model;
      return model;
    } catch (err) {
      console.warn('[useVirtualBackground] Model load failed:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!inputStream || !enabled) {
      setProcessedStream(inputStream);
      return;
    }

    const videoTrack = inputStream.getVideoTracks()[0];
    if (!videoTrack) {
      setProcessedStream(inputStream);
      return;
    }

    const settings = videoTrack.getSettings();
    const width = settings.width ?? 640;
    const height = settings.height ?? 480;

    // Create offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvasRef.current = canvas;

    const ctx = canvas.getContext('2d')!;

    // Source video element
    const video = document.createElement('video');
    video.srcObject = new MediaStream([videoTrack]);
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.width = width;
    video.height = height;

    let model: unknown = modelRef.current;
    setIsProcessing(true);

    // Capture canvas stream
    const outStream = canvas.captureStream(30);

    // Merge audio tracks from original stream
    for (const audioTrack of inputStream.getAudioTracks()) {
      outStream.addTrack(audioTrack);
    }

    setProcessedStream(outStream);

    let active = true;

    async function processFrame() {
      if (!active) return;

      if (video.readyState >= 2) {
        const bg = bgRef.current;

        if (bg.type === 'none' || !model) {
          // Pass-through: just draw the video
          ctx.drawImage(video, 0, 0, width, height);
        } else {
          try {
            // Run segmentation
            const segmenter = model as {
              segmentPeople: (
                video: HTMLVideoElement,
                opts: Record<string, unknown>
              ) => Promise<Array<{ mask: { toImageData: () => ImageData } }>>;
            };

            const people = await segmenter.segmentPeople(video, {
              flipHorizontal: false,
              multiSegmentation: false,
              segmentBodyParts: false,
              segmentationThreshold: 0.5,
            });

            if (people.length === 0) {
              ctx.drawImage(video, 0, 0, width, height);
            } else {
              // Get mask
              const maskData = people[0].mask.toImageData();
              const maskCanvas = document.createElement('canvas');
              maskCanvas.width = width;
              maskCanvas.height = height;
              const maskCtx = maskCanvas.getContext('2d')!;
              maskCtx.putImageData(maskData, 0, 0);

              // Draw background
              if (bg.type === 'blur') {
                ctx.filter = `blur(${bg.radius}px)`;
                ctx.drawImage(video, 0, 0, width, height);
                ctx.filter = 'none';
              } else if (bg.type === 'color') {
                ctx.fillStyle = bg.color;
                ctx.fillRect(0, 0, width, height);
              } else if (bg.type === 'image' && bgImageRef.current?.complete) {
                ctx.drawImage(bgImageRef.current, 0, 0, width, height);
              } else {
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 0, width, height);
              }

              // Composite person over background using mask
              ctx.globalCompositeOperation = 'destination-atop';
              ctx.drawImage(video, 0, 0, width, height);
              ctx.globalCompositeOperation = 'source-over';

              // Apply mask (alpha)
              ctx.globalCompositeOperation = 'destination-in';
              ctx.drawImage(maskCanvas, 0, 0, width, height);
              ctx.globalCompositeOperation = 'source-over';
            }
          } catch {
            // Fallback: just draw video
            ctx.drawImage(video, 0, 0, width, height);
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    }

    video.onloadedmetadata = async () => {
      // Load model lazily on first use
      if (!model) {
        model = await loadModel();
        modelRef.current = model;
        setIsProcessing(false);
      }
      processFrame();
    };

    // Preload background image if needed
    if (background.type === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = background.url;
      img.onload = () => { bgImageRef.current = img; };
    }

    return () => {
      active = false;
      cancelAnimationFrame(animFrameRef.current);
      video.srcObject = null;
      outStream.getTracks().forEach(t => {
        // Don't stop audio tracks (shared from inputStream)
        if (t.kind === 'video') t.stop();
      });
    };
  }, [inputStream, enabled, loadModel]);

  // Update bg image when background changes to image type
  useEffect(() => {
    if (background.type === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = background.url;
      img.onload = () => { bgImageRef.current = img; };
    }
  }, [background]);

  return {
    processedStream: enabled ? processedStream : inputStream,
    isProcessing,
    background,
    setBackground,
    error,
  };
}
