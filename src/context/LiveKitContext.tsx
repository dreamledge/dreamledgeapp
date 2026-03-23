import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Room, RoomEvent, VideoTrack, AudioTrack, Participant, Track, LocalParticipant, ConnectionState } from 'livekit-client';
import { useAuth } from '../hooks/useAuth';

interface LiveKitContextType {
  room: Room | null;
  token: string | null;
  connect: (roomName: string) => Promise<void>;
  disconnect: () => void;
  connectionState: ConnectionState;
  connectionError: string | null;
  participants: Participant[];
  activeSpeaker: Participant | null;
}

const LiveKitContext = createContext<LiveKitContextType | undefined>(undefined);

export function LiveKitProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = React.useRef<Room | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<Participant | null>(null);
  const connectingPromise = React.useRef<{ promise: Promise<void>, roomName: string } | null>(null);

  const profileRef = React.useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      try {
        await roomRef.current.disconnect();
      } catch (e) {
        console.error("[LiveKit] Error during disconnect:", e);
      }
      roomRef.current = null;
      setRoom(null);
      setToken(null);
      setParticipants([]);
      setActiveSpeaker(null);
      setConnectionState(ConnectionState.Disconnected);
      setConnectionError(null);
    }
  }, []);

  const connect = useCallback(async (roomName: string) => {
    const currentProfile = profileRef.current;
    if (!currentProfile) return;
    
    // If already connecting to THIS room, wait for it
    if (connectingPromise.current && connectingPromise.current.roomName === roomName) {
      return connectingPromise.current.promise;
    }

    // If already connected to this room, do nothing
    if (roomRef.current && roomRef.current.name === roomName && (roomRef.current.state === ConnectionState.Connected || roomRef.current.state === ConnectionState.Connecting)) {
      return;
    }

    const performConnect = async () => {
      // If connected or connecting to a different room, disconnect first
      if (roomRef.current || (connectingPromise.current && connectingPromise.current.roomName !== roomName)) {
        console.log(`[LiveKit] Switching from ${roomRef.current?.name || connectingPromise.current?.roomName} to ${roomName}`);
        if (roomRef.current) {
          await roomRef.current.disconnect();
          roomRef.current = null;
          setRoom(null);
        }
      }
      
    try {
      setConnectionState(ConnectionState.Connecting);
      setConnectionError(null);
      console.log(`[LiveKit] Connecting to room: ${roomName}...`);

      const params = new URLSearchParams({
        room: roomName,
        identity: currentProfile.uid,
        name: currentProfile.username || currentProfile.uid
      });
      
      const response = await fetch(`/api/livekit/token?${params.toString()}`);
      
      // Check if the response is JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("[LiveKit] Received non-JSON response from server:", text.substring(0, 100));
        throw new Error(`Server returned HTML instead of JSON. This usually means the API route is not correctly configured or the server is not running.`);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch token: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      const newToken = data.token;
      setToken(newToken);
      console.log("[LiveKit] Token received successfully");

      // 2. Create and connect to room
      let livekitUrl = (import.meta as any).env.VITE_LIVEKIT_URL;
      if (!livekitUrl) {
        throw new Error("VITE_LIVEKIT_URL is not configured");
      }

      // Ensure URL starts with wss://
      if (livekitUrl.startsWith('https://')) {
        livekitUrl = livekitUrl.replace('https://', 'wss://');
      } else if (!livekitUrl.startsWith('wss://') && !livekitUrl.startsWith('ws://')) {
        livekitUrl = `wss://${livekitUrl}`;
      }
      
      console.log(`[LiveKit] Using URL: ${livekitUrl}`);

      const newRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: {
            simulcast: true,
          }
        });

        roomRef.current = newRoom;
        setRoom(newRoom);

        // Set up event listeners
        newRoom
          .on(RoomEvent.ParticipantConnected, (participant) => {
            console.log(`[LiveKit] Participant connected: ${participant.identity}`);
            setParticipants(Array.from(newRoom.remoteParticipants.values()));
          })
          .on(RoomEvent.ParticipantDisconnected, (participant) => {
            console.log(`[LiveKit] Participant disconnected: ${participant.identity}`);
            setParticipants(Array.from(newRoom.remoteParticipants.values()));
          })
          .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            setActiveSpeaker(speakers[0] || null);
          })
          .on(RoomEvent.TrackPublished, (publication, participant) => {
            console.log(`[LiveKit] Track published: ${publication.source} by ${participant.identity}`);
          })
          .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
            console.log(`[LiveKit] Track subscribed: ${publication.source} from ${participant.identity}`);
          })
          .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            console.log(`[LiveKit] Track unsubscribed: ${publication.source} from ${participant.identity}`);
          })
          .on(RoomEvent.LocalTrackPublished, (publication) => {
            console.log(`[LiveKit] Local track published: ${publication.source}`);
          })
          .on(RoomEvent.LocalTrackUnpublished, (publication) => {
            console.log(`[LiveKit] Local track unpublished: ${publication.source}`);
          })
          .on(RoomEvent.ConnectionStateChanged, (state) => {
            console.log(`[LiveKit] Connection state changed: ${state}`);
            setConnectionState(state);
          })
          .on(RoomEvent.Disconnected, (reason) => {
            console.log(`[LiveKit] Disconnected from room: ${reason}`);
          });

        await newRoom.connect(livekitUrl, newToken, {
          autoSubscribe: true,
          rtcConfig: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });
        
        setParticipants(Array.from(newRoom.remoteParticipants.values()));
        setConnectionState(newRoom.state);
        setConnectionError(null);

        console.log(`[LiveKit] Connected successfully to room: ${roomName}`);
      } catch (error: any) {
        setConnectionState(ConnectionState.Disconnected);
        const errorMessage = error.message || "Unknown connection error";
        setConnectionError(errorMessage);
        console.error("[LiveKit] Connection failed:", error);
        throw error;
      } finally {
        connectingPromise.current = null;
      }
    };

    const p = performConnect();
    connectingPromise.current = { promise: p, roomName };
    return p;
  }, []);

  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
    };
  }, []);

  return (
    <LiveKitContext.Provider value={{ 
      room, 
      token, 
      connect, 
      disconnect, 
      connectionState, 
      connectionError,
      participants,
      activeSpeaker
    }}>
      {children}
    </LiveKitContext.Provider>
  );
}

export function useLiveKit() {
  const context = useContext(LiveKitContext);
  if (context === undefined) {
    throw new Error('useLiveKit must be used within a LiveKitProvider');
  }
  return context;
}
