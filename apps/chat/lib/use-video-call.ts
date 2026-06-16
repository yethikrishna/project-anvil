/**
 * useVideoCall — WebRTC 1:1 video call with screen sharing.
 *
 * Call flow:
 * 1. Caller: initiateCall(targetUserId) → sends 'call-request' signal
 * 2. Callee: sees 'call-request' → acceptCall() or rejectCall()
 * 3. Caller: receives 'call-accept' → creates offer + sends via signal
 * 4. Callee: receives offer → creates answer + sends via signal
 * 5. Both: exchange ICE candidates
 * 6. Connection established → streams flow P2P
 *
 * Screen sharing:
 * - Either party can toggle screen share
 * - Replaces video track in existing connection (no reconnect needed)
 *
 * Virtual background:
 * - Optional: hook into useVirtualBackground to process local video frames
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(process.env.NEXT_PUBLIC_TURN_URL ? [{
    urls: process.env.NEXT_PUBLIC_TURN_URL,
    username: process.env.NEXT_PUBLIC_TURN_USERNAME ?? '',
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL ?? '',
  }] : []),
];

export type CallState =
  | 'idle'
  | 'ringing-outbound'  // we initiated, waiting for answer
  | 'ringing-inbound'   // incoming call
  | 'connecting'        // ICE negotiation
  | 'active'            // call is live
  | 'ended';

export interface IncomingCall {
  from: string;
  callId: string;
  hasVideo: boolean;
}

interface UseVideoCallOptions {
  userId: string;
  onCallEnded?: () => void;
  onError?: (err: string) => void;
}

interface UseVideoCallReturn {
  callState: CallState;
  incomingCall: IncomingCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  connectedTo: string | null;

  initiateCall: (targetUserId: string, withVideo?: boolean) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => Promise<void>;
}

export function useVideoCall({
  userId,
  onCallEnded,
  onError,
}: UseVideoCallOptions): UseVideoCallReturn {
  const [callState, setCallState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [connectedTo, setConnectedTo] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);

  // ── Signal helpers ──

  const sendSignal = useCallback(async (
    type: string,
    to: string,
    payload: unknown,
  ) => {
    try {
      await fetch('/api/call/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, from: userId, to, payload }),
      });
    } catch (err) {
      console.error('[useVideoCall] sendSignal failed:', err);
    }
  }, [userId]);

  // ── Get media ──

  const getMedia = useCallback(async (withVideo = true): Promise<MediaStream> => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: withVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  // ── Create peer connection ──

  const createPeerConnection = useCallback((targetId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // Add local tracks
    const stream = localStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
    }

    // Remote stream
    const remoteStr = new MediaStream();
    setRemoteStream(remoteStr);

    pc.ontrack = (e) => {
      for (const track of e.streams[0]?.getTracks() ?? []) {
        remoteStr.addTrack(track);
      }
    };

    // ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal('ice-candidate', targetId, e.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('active');
        setConnectedTo(targetId);
      } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        cleanup();
        onCallEnded?.();
      }
    };

    return pc;
  }, [sendSignal, onCallEnded]);

  // ── Cleanup ──

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setConnectedTo(null);
    setIsScreenSharing(false);
    setIsMuted(false);
    setIsVideoOff(false);

    pcRef.current?.close();
    pcRef.current = null;
  }, []);

  // ── Initiate call ──

  const initiateCall = useCallback(async (targetUserId: string, withVideo = true) => {
    try {
      await getMedia(withVideo);
      setCallState('ringing-outbound');
      await sendSignal('call-request', targetUserId, { callId: `call_${Date.now()}`, hasVideo: withVideo });
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to access camera/mic');
    }
  }, [getMedia, sendSignal, onError]);

  // ── Accept call ──

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    try {
      const withVideo = incomingCall.hasVideo;
      await getMedia(withVideo);

      await sendSignal('call-accept', incomingCall.from, {});
      setCallState('connecting');

      const pc = createPeerConnection(incomingCall.from);

      // Apply pending offer if already received
      if (pendingOfferRef.current) {
        await pc.setRemoteDescription(pendingOfferRef.current);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal('answer', incomingCall.from, answer);
        pendingOfferRef.current = null;
      }

      setIncomingCall(null);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to accept call');
    }
  }, [incomingCall, getMedia, sendSignal, createPeerConnection, onError]);

  // ── Reject call ──

  const rejectCall = useCallback(() => {
    if (incomingCall) {
      sendSignal('call-reject', incomingCall.from, {});
    }
    setIncomingCall(null);
  }, [incomingCall, sendSignal]);

  // ── End call ──

  const endCall = useCallback(() => {
    if (connectedTo) {
      sendSignal('call-end', connectedTo, {});
    }
    cleanup();
    onCallEnded?.();
  }, [connectedTo, sendSignal, cleanup, onCallEnded]);

  // ── Toggle mute ──

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) {
      for (const track of stream.getAudioTracks()) {
        track.enabled = !track.enabled;
      }
      setIsMuted(prev => !prev);
    }
  }, []);

  // ── Toggle video ──

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) {
      for (const track of stream.getVideoTracks()) {
        track.enabled = !track.enabled;
      }
      setIsVideoOff(prev => !prev);
    }
  }, []);

  // ── Screen share ──

  const toggleScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    if (isScreenSharing) {
      // Stop screen share, restore camera
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);

      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(cameraTrack);
      }

      if (connectedTo) {
        sendSignal('screen-share-end', connectedTo, {});
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          audio: true,
        });
        screenStreamRef.current = screenStream;

        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(screenTrack);

        setIsScreenSharing(true);

        // Auto-stop when user ends share via browser UI
        screenTrack.onended = () => {
          setIsScreenSharing(false);
          screenStreamRef.current = null;
          const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
          if (cameraTrack) {
            pc.getSenders().find(s => s.track?.kind === 'video')?.replaceTrack(cameraTrack);
          }
        };

        if (connectedTo) {
          sendSignal('screen-share-start', connectedTo, {});
        }
      } catch (err) {
        onError?.('Screen share cancelled or not supported');
      }
    }
  }, [isScreenSharing, connectedTo, sendSignal, onError]);

  // ── Handle incoming signals ──

  const handleSignal = useCallback(async (signal: {
    type: string;
    from: string;
    payload: unknown;
  }) => {
    const { type, from, payload } = signal;

    if (type === 'call-request') {
      const p = payload as { callId: string; hasVideo: boolean };
      setIncomingCall({ from, callId: p.callId, hasVideo: p.hasVideo });
      setCallState('ringing-inbound');
      return;
    }

    if (type === 'call-accept') {
      // We initiated, now create offer
      setCallState('connecting');
      const pc = createPeerConnection(from);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal('offer', from, offer);
      return;
    }

    if (type === 'call-reject') {
      cleanup();
      onError?.(`${from} declined the call`);
      return;
    }

    if (type === 'call-end') {
      cleanup();
      onCallEnded?.();
      return;
    }

    if (type === 'offer') {
      const offer = payload as RTCSessionDescriptionInit;
      const pc = pcRef.current;
      if (pc) {
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal('answer', from, answer);
      } else {
        // Store for when acceptCall is called
        pendingOfferRef.current = offer;
      }
      return;
    }

    if (type === 'answer') {
      const pc = pcRef.current;
      if (pc) {
        await pc.setRemoteDescription(payload as RTCSessionDescriptionInit);
      }
      return;
    }

    if (type === 'ice-candidate') {
      const pc = pcRef.current;
      if (pc) {
        try {
          await pc.addIceCandidate(payload as RTCIceCandidateInit);
        } catch { /* can fail if connection is closing */ }
      }
      return;
    }

    if (type === 'screen-share-start' || type === 'screen-share-end') {
      // Could show indicator for remote screen share
      return;
    }
  }, [createPeerConnection, sendSignal, cleanup, onCallEnded, onError]);

  // ── SSE signal listener ──

  useEffect(() => {
    const es = new EventSource(`/api/call/signal?userId=${encodeURIComponent(userId)}`);
    esRef.current = es;

    es.addEventListener('signal', (e) => {
      try {
        handleSignal(JSON.parse(e.data));
      } catch { /* ignore */ }
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [userId, handleSignal]);

  // ── Cleanup on unmount ──

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  return {
    callState,
    incomingCall,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    isScreenSharing,
    connectedTo,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
  };
}
