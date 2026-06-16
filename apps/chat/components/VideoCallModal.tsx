'use client';

/**
 * VideoCallModal — Full-featured 1:1 video call UI.
 *
 * Features:
 * - Local + remote video streams
 * - Mute / camera toggle
 * - Screen sharing with indicator
 * - Virtual background selector (blur, color, image)
 * - Call timer
 * - Incoming call notification toast
 * - Picture-in-picture for local video
 * - Audio level indicator on avatar when video is off
 */

import { useState, useRef, useEffect } from 'react';
import { useVideoCall, type CallState } from '@/lib/use-video-call';
import { useVirtualBackground, type BackgroundType } from '@/lib/use-virtual-background';
import AudioVisualizer from './AudioVisualizer';

interface VideoCallModalProps {
  userId: string;
  onClose?: () => void;
}

const BG_OPTIONS: { label: string; bg: BackgroundType }[] = [
  { label: 'None', bg: { type: 'none' } },
  { label: 'Blur', bg: { type: 'blur', radius: 15 } },
  { label: 'Dark', bg: { type: 'color', color: '#1a1a2e' } },
  { label: 'Ocean', bg: { type: 'color', color: '#0a3040' } },
  { label: 'Forest', bg: { type: 'color', color: '#1a3a1a' } },
  { label: 'Studio', bg: { type: 'color', color: '#2a2a2a' } },
];

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function VideoCallModal({ userId, onClose }: VideoCallModalProps) {
  const [targetUserId, setTargetUserId] = useState('');
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [virtualBgEnabled, setVirtualBgEnabled] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const {
    callState, incomingCall, localStream, remoteStream,
    isMuted, isVideoOff, isScreenSharing, connectedTo,
    initiateCall, acceptCall, rejectCall, endCall,
    toggleMute, toggleVideo, toggleScreenShare,
  } = useVideoCall({
    userId,
    onCallEnded: () => {
      setCallStartTime(null);
      setDuration(0);
    },
    onError: (err) => console.error('[VideoCall]', err),
  });

  const { processedStream, background, setBackground } = useVirtualBackground(
    localStream,
    virtualBgEnabled,
  );

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = processedStream ?? localStream;
    }
  }, [processedStream, localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Track call duration
  useEffect(() => {
    if (callState === 'active' && !callStartTime) {
      setCallStartTime(Date.now());
    }
  }, [callState, callStartTime]);

  useEffect(() => {
    if (!callStartTime) return;
    const interval = setInterval(() => {
      setDuration(Date.now() - callStartTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [callStartTime]);

  const isCallActive = callState === 'active' || callState === 'connecting';
  const isIdle = callState === 'idle';

  return (
    <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[100]">
      {/* ── Incoming call notification ── */}
      {callState === 'ringing-inbound' && incomingCall && (
        <div className="bg-gray-800 border border-white/10 rounded-2xl p-6 w-80 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-violet-600 flex items-center justify-center text-2xl mx-auto mb-4">
            📹
          </div>
          <h3 className="font-semibold text-gray-100 text-lg mb-1">Incoming call</h3>
          <p className="text-gray-400 mb-6">{incomingCall.from}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={rejectCall}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white text-2xl flex items-center justify-center transition-colors"
              title="Reject"
            >
              📵
            </button>
            <button
              onClick={acceptCall}
              className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-2xl flex items-center justify-center transition-colors"
              title="Accept"
            >
              📞
            </button>
          </div>
        </div>
      )}

      {/* ── Outbound ringing ── */}
      {callState === 'ringing-outbound' && (
        <div className="bg-gray-800 border border-white/10 rounded-2xl p-8 w-80 text-center">
          <div className="w-16 h-16 rounded-full bg-violet-600 flex items-center justify-center text-2xl mx-auto mb-4 animate-pulse">
            📞
          </div>
          <h3 className="font-semibold text-gray-100 mb-1">Calling {connectedTo ?? targetUserId}…</h3>
          <p className="text-sm text-gray-500 mb-6">Waiting for answer</p>
          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white text-2xl flex items-center justify-center mx-auto transition-colors"
          >
            📵
          </button>
        </div>
      )}

      {/* ── Active call UI ── */}
      {isCallActive && (
        <div className="w-full h-full relative flex flex-col">
          {/* Remote video (main) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover bg-gray-900"
          />

          {/* Remote offline overlay */}
          {!remoteStream && (
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center text-4xl mx-auto mb-4">
                  👤
                </div>
                <p className="text-gray-400">{connectedTo}</p>
                {callState === 'connecting' && (
                  <p className="text-xs text-gray-600 mt-1">Connecting…</p>
                )}
              </div>
            </div>
          )}

          {/* Screen share indicator */}
          {isScreenSharing && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-600/90 text-white text-xs px-3 py-1 rounded-full">
              Screen sharing active
            </div>
          )}

          {/* Call timer */}
          <div className="absolute top-4 left-4 bg-black/50 text-white text-sm px-3 py-1 rounded-full font-mono">
            {formatDuration(duration)}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full text-white flex items-center justify-center"
          >
            ✕
          </button>

          {/* Local video PiP */}
          <div className="absolute bottom-24 right-4 w-36 h-24 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg bg-gray-900">
            {!isVideoOff ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                Camera off
              </div>
            )}
          </div>

          {/* Background picker */}
          {showBgPicker && (
            <div className="absolute bottom-24 left-4 bg-gray-800/95 border border-white/10 rounded-xl p-3 shadow-xl">
              <p className="text-xs text-gray-400 mb-2 font-medium">Virtual Background</p>
              <div className="flex gap-2 flex-wrap max-w-xs">
                {BG_OPTIONS.map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => {
                      setBackground(opt.bg);
                      setVirtualBgEnabled(opt.bg.type !== 'none');
                    }}
                    className={`
                      px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                      ${JSON.stringify(background) === JSON.stringify(opt.bg)
                        ? 'bg-violet-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}
                    `}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Controls bar */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent pt-8 pb-6">
            <div className="flex items-center justify-center gap-4">
              {/* Mute */}
              <button
                onClick={toggleMute}
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center text-lg transition-all
                  ${isMuted ? 'bg-red-600 text-white' : 'bg-white/20 hover:bg-white/30 text-white'}
                `}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? '🔇' : '🎤'}
              </button>

              {/* Camera */}
              <button
                onClick={toggleVideo}
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center text-lg transition-all
                  ${isVideoOff ? 'bg-red-600 text-white' : 'bg-white/20 hover:bg-white/30 text-white'}
                `}
                title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
              >
                {isVideoOff ? '📵' : '📹'}
              </button>

              {/* Screen share */}
              <button
                onClick={toggleScreenShare}
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center text-lg transition-all
                  ${isScreenSharing ? 'bg-emerald-600 text-white' : 'bg-white/20 hover:bg-white/30 text-white'}
                `}
                title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
              >
                🖥️
              </button>

              {/* Virtual background */}
              <button
                onClick={() => setShowBgPicker(p => !p)}
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center text-lg transition-all
                  ${showBgPicker ? 'bg-violet-600 text-white' : 'bg-white/20 hover:bg-white/30 text-white'}
                `}
                title="Virtual background"
              >
                🌄
              </button>

              {/* End call */}
              <button
                onClick={endCall}
                className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white text-2xl flex items-center justify-center transition-colors shadow-lg"
                title="End call"
              >
                📵
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Call initiation UI (idle) ── */}
      {isIdle && !incomingCall && (
        <div className="bg-gray-800 border border-white/10 rounded-2xl p-6 w-80 shadow-2xl">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full text-white flex items-center justify-center"
          >
            ✕
          </button>

          <h3 className="font-semibold text-gray-100 text-lg mb-1">Start a video call</h3>
          <p className="text-sm text-gray-500 mb-4">Enter the user ID to call</p>

          <input
            type="text"
            value={targetUserId}
            onChange={e => setTargetUserId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && targetUserId && initiateCall(targetUserId)}
            placeholder="User ID"
            className="w-full bg-gray-700/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-violet-500/50 mb-4"
            autoFocus
          />

          <div className="flex gap-2">
            <button
              onClick={() => initiateCall(targetUserId, false)}
              disabled={!targetUserId.trim()}
              className="flex-1 py-2 rounded-lg text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 transition-colors"
            >
              📞 Audio
            </button>
            <button
              onClick={() => initiateCall(targetUserId, true)}
              disabled={!targetUserId.trim()}
              className="flex-1 py-2 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition-colors"
            >
              📹 Video
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
