import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

interface MediaStreamContextType {
  localStream: MediaStream | null;
  isMicOn: boolean;
  hasAudioDevice: boolean;
  setHasAudioDevice: (val: boolean) => void;
  mediaError: string | null;
  startMedia: (retryWithAudioOnly?: boolean) => Promise<MediaStream | null>;
  toggleMic: () => void;
  stopMedia: () => void;
  checkDevices: () => Promise<void>;
}

const MediaStreamContext = createContext<MediaStreamContextType | undefined>(undefined);

export function MediaStreamProvider({ children }: { children: React.ReactNode }) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(() => localStorage.getItem('micEnabled') !== 'false');
  const [hasAudioDevice, setHasAudioDevice] = useState(true);
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
      
      setHasAudioDevice(hasAudio);
      console.log(`[MediaStream] Device check: audio=${hasAudio}`);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // stopMedia(); 
    };
  }, [stopMedia]);

  return (
    <MediaStreamContext.Provider value={{ 
      localStream, 
      isMicOn, 
      hasAudioDevice,
      setHasAudioDevice,
      mediaError, 
      startMedia, 
      toggleMic, 
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
