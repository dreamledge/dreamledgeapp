import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

interface MediaStreamContextType {
  localStream: MediaStream | null;
  isMicOn: boolean;
  isCameraOn: boolean;
  hasAudioDevice: boolean;
  hasVideoDevice: boolean;
  setHasAudioDevice: (val: boolean) => void;
  setHasVideoDevice: (val: boolean) => void;
  mediaError: string | null;
  startMedia: (retryWithAudioOnly?: boolean) => Promise<MediaStream | null>;
  toggleMic: () => void;
  toggleCamera: () => void;
  stopMedia: () => void;
  checkDevices: () => Promise<void>;
}

const MediaStreamContext = createContext<MediaStreamContextType | undefined>(undefined);

export function MediaStreamProvider({ children }: { children: React.ReactNode }) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(() => localStorage.getItem('micEnabled') !== 'false');
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [hasAudioDevice, setHasAudioDevice] = useState(true);
  const [hasVideoDevice, setHasVideoDevice] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const checkDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('[MediaStream] enumerateDevices not supported');
        return;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log('[MediaStream] All detected devices:');
      devices.forEach(d => {
        console.log(`- ${d.kind}: ${d.label || 'unnamed'} (id: ${d.deviceId})`);
      });

      const hasAudio = devices.some(d => d.kind === 'audioinput');
      const hasVideo = devices.some(d => d.kind === 'videoinput');
      
      // Only update if we actually found something, or if we want to be strict.
      // But per requirements, we shouldn't set hasVideoDevice=false just because enumerateDevices says so.
      // However, for UI purposes, we can update it if we've already tried and failed.
      setHasAudioDevice(hasAudio);
      setHasVideoDevice(hasVideo);
      console.log(`[MediaStream] Device check: audio=${hasAudio}, video=${hasVideo}`);
    } catch (e) {
      console.warn('[MediaStream] Device check failed:', e);
    }
  }, []);

  // Check for devices on mount
  useEffect(() => {
    checkDevices();
    
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', checkDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', checkDevices);
      };
    }
  }, [checkDevices]);

  // Ensure isCameraOn is false if no video device is found
  useEffect(() => {
    if (!hasVideoDevice && isCameraOn) {
      console.log('[MediaStream] No video device found, forcing isCameraOn to false');
      setIsCameraOn(false);
      localStorage.setItem('cameraEnabled', 'false');
    }
  }, [hasVideoDevice, isCameraOn]);

  // Ensure isMicOn is false if no audio device is found
  useEffect(() => {
    if (!hasAudioDevice && isMicOn) {
      console.log('[MediaStream] No audio device found, forcing isMicOn to false');
      setIsMicOn(false);
      localStorage.setItem('micEnabled', 'false');
    }
  }, [hasAudioDevice, isMicOn]);

  const stopMedia = useCallback(() => {
    console.log('[MediaStream] Stopping all tracks');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        console.log(`[MediaStream] Stopping track: ${track.kind}`);
        track.stop();
      });
      streamRef.current = null;
      setLocalStream(null);
    }
  }, []);

  const startMedia = useCallback(async (retryLevel = 0) => {
    // retryLevel: 0 = full (audio only), 1 = simple (audio only), 2 = audio only
    
    // If we already have a functional stream, reuse it
    if (streamRef.current && streamRef.current.active) {
      console.log('[MediaStream] Reusing existing active stream');
      return streamRef.current;
    }

    console.log(`[MediaStream] Starting media (retryLevel: ${retryLevel}) - Audio Only Mode`);
    setMediaError(null);

    let constraints: MediaStreamConstraints = {
      audio: true,
      video: false
    };

    try {
      console.log(`[MediaStream] Requesting getUserMedia (Level ${retryLevel}) with constraints:`, constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[MediaStream] Stream successfully acquired:', stream.id);
      
      streamRef.current = stream;
      setLocalStream(stream);

      if (stream.getAudioTracks().length > 0) {
        setHasAudioDevice(true);
      }

      // Apply initial states to the tracks
      stream.getAudioTracks().forEach(track => {
        track.enabled = isMicOn;
        console.log(`[MediaStream] Initial audio track (${track.label}) enabled: ${isMicOn}`);
        
        track.onended = () => {
          console.warn(`[MediaStream] Audio track ended: ${track.label}`);
        };
      });
      
      // Refresh device list now that we have permission
      checkDevices();

      return stream;
    } catch (e: any) {
      console.error(`[MediaStream] Media access error (Level ${retryLevel}):`, e.name, e.message);
      
      if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        setHasAudioDevice(false);
      }

      // If all levels failed, set error message
      let errorMessage = "Could not access microphone.";
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        errorMessage = "Microphone access denied. Please enable permissions in your browser settings and refresh.";
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        errorMessage = "The requested microphone was not found. Please connect a microphone and try again.";
      } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
        errorMessage = "Microphone is already in use by another application.";
      } else {
        errorMessage = `Media Error: ${e.message || 'Unknown error'}`;
      }
      
      setMediaError(errorMessage);
      return null;
    }
  }, [isMicOn, checkDevices]);

  const toggleMic = useCallback(() => {
    const newState = !isMicOn;
    setIsMicOn(newState);
    localStorage.setItem('micEnabled', String(newState));
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = newState;
        console.log(`[MediaStream] Toggled audio track: ${newState}`);
      });
    }
  }, [isMicOn]);

  const toggleCamera = useCallback(() => {
    const newState = !isCameraOn;
    setIsCameraOn(newState);
    console.log(`[MediaStream] Toggled virtual camera state: ${newState}`);
  }, [isCameraOn]);

  // Cleanup on unmount (only if we really want to stop it when the whole app closes)
  useEffect(() => {
    return () => {
      // In a real app, we might want to keep it alive even if this provider re-renders,
      // but if the provider unmounts, the app is likely closing.
      // stopMedia(); 
    };
  }, [stopMedia]);

  return (
    <MediaStreamContext.Provider value={{ 
      localStream, 
      isMicOn, 
      isCameraOn, 
      hasAudioDevice,
      hasVideoDevice,
      setHasAudioDevice,
      setHasVideoDevice,
      mediaError, 
      startMedia, 
      toggleMic, 
      toggleCamera,
      stopMedia,
      checkDevices
    }}>
      {children}
    </MediaStreamContext.Provider>
  );
}

export function useMediaStream() {
  const context = useContext(MediaStreamContext);
  if (context === undefined) {
    throw new Error('useMediaStream must be used within a MediaStreamProvider');
  }
  return context;
}
