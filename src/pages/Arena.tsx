import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LiveKitRoom, 
  VideoTrack, 
  AudioTrack, 
  RoomAudioRenderer,
  useTracks, 
  useLocalParticipant,
  useRemoteParticipants,
  useParticipantInfo,
  TrackReference
} from '@livekit/components-react';
import { Track as LKTrack, Participant, ConnectionState, RemoteParticipant, LocalParticipant as LKLocalParticipant } from 'livekit-client';
import { useLiveKit } from '../context/LiveKitContext';
import { useAuth } from '../hooks/useAuth';
import { useMediaStream } from '../context/MediaStreamContext';
import { db, storage } from '../firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  doc, 
  deleteDoc, 
  updateDoc, 
  setDoc, 
  query, 
  where, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { cn } from '../lib/utils';
import { 
  Sword, 
  Clock, 
  Users, 
  Trophy, 
  Pause, 
  Play, 
  Send, 
  MessageSquare, 
  User, 
  ImageIcon, 
  Mic2, 
  MicOff,
  Wifi,
  WifiOff,
  Loader2,
  MoreVertical,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import GifPicker from '../components/GifPicker';

interface UserProfile {
  uid: string;
  username: string;
  photoURL: string;
  bio?: string;
}

interface BattleState {
  id: string;
  status: 'waiting' | 'selection' | 'active' | 'voting' | 'finished';
  artistA: string;
  artistB: string;
  judge1: string | null;
  judge2: string | null;
  phase: string;
  phaseStartTime: number;
  tracks: { [uid: string]: string };
  votes: { [uid: string]: string };
  winner: string | null;
  currentPlayingArtist?: string | null;
  isCustom: boolean;
  roomCode?: string;
}

export default function Arena() {
  const { battleId } = useParams();
  const { profile } = useAuth();
  const { 
    localStream, 
    isMicOn, 
    hasAudioDevice,
    setHasAudioDevice,
    toggleMic, 
    startMedia, 
    mediaError: contextMediaError 
  } = useMediaStream();
  const { connect: connectLiveKit, disconnect: disconnectLiveKit, room: lkRoom, activeSpeaker, connectionState, connectionError, participants: lkParticipants } = useLiveKit();
  const navigate = useNavigate();

  const getParticipant = useCallback((identity: string | null | undefined) => {
    if (!identity || !lkRoom) return null;
    
    // Check local participant first
    if (identity === profile?.uid) {
      return lkRoom.localParticipant;
    }

    // Use LiveKit's built-in method to find participant by identity
    const p = lkRoom.getParticipantByIdentity(identity);
    
    if (p) {
      console.log(`[Arena] getParticipant: Found participant for ${identity}`);
    } else {
      console.log(`[Arena] getParticipant: Participant NOT found for ${identity}. Identities in room:`, 
        lkParticipants?.map(rp => rp.identity)
      );
    }
    return p || null;
  }, [lkRoom, lkParticipants, profile?.uid]);

  // Debug logging for LiveKit state
  useEffect(() => {
    console.log("[Arena] LiveKit State:", {
      connectionState,
      roomName: lkRoom?.name,
      localParticipant: lkRoom?.localParticipant?.identity,
      remoteParticipants: lkParticipants?.length,
      activeSpeaker: activeSpeaker?.identity,
      hasAudioDevice
    });
  }, [connectionState, lkRoom, lkParticipants, activeSpeaker, hasAudioDevice]);
  
  const [isLockedSpectator] = useState(() => localStorage.getItem('arenaRole') === 'spectator');
  
  const [battle, setBattle] = useState<BattleState | null>(null);
  const isArtist = battle?.artistA === profile?.uid || battle?.artistB === profile?.uid;
  const isJudge = battle?.judge1 === profile?.uid || battle?.judge2 === profile?.uid;
  const [profiles, setProfiles] = useState<{ [uid: string]: UserProfile }>({});
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [activeTrack, setActiveTrack] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [activeUserMenu, setActiveUserMenu] = useState<{ uid: string, x: number, y: number } | null>(null);
  const isSyncingMediaRef = useRef(false);
  const mediaSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const desiredMediaStateRef = useRef({ mic: false, camera: false });
  const battleRef = useRef<BattleState | null>(null);
  const profilesRef = useRef<{ [uid: string]: UserProfile }>({});
  const hasLeftRef = useRef(false);

  useEffect(() => {
    battleRef.current = battle;
  }, [battle]);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  // Handle Leave Arena
  const handleLeave = useCallback(async () => {
    if (hasLeftRef.current || !battleId || !profile) return;
    
    console.log("[Arena] handleLeave triggered");
    hasLeftRef.current = true;

    const currentBattle = battleRef.current;
    if (!currentBattle) {
      console.warn("[Arena] No battle state found during leave");
      return;
    }

    try {
      // 1. Remove from participants collection
      const participantRef = doc(db, 'battles', battleId, 'participants', profile.uid);
      await deleteDoc(participantRef);
      console.log("[Arena] Removed from participants collection");

      // 2. Add system message
      await addDoc(collection(db, 'battles', battleId, 'messages'), {
        senderId: 'system',
        text: `${profile.username} has left the arena.`,
        timestamp: Date.now()
      });

      // 3. Update battle state (clear role)
      const updateData: any = {};
      let shouldUpdate = false;

      // Check all roles and clear if it matches current user
      if (currentBattle.artistA === profile.uid) { updateData.artistA = null; shouldUpdate = true; }
      if (currentBattle.artistB === profile.uid) { updateData.artistB = null; shouldUpdate = true; }
      if (currentBattle.judge1 === profile.uid) { updateData.judge1 = null; shouldUpdate = true; }
      if (currentBattle.judge2 === profile.uid) { updateData.judge2 = null; shouldUpdate = true; }

      // If battle is active and an artist leaves, handle winner
      if (['selection', 'active', 'voting'].includes(currentBattle.status)) {
        if (currentBattle.artistA === profile.uid && currentBattle.artistB) {
          updateData.winner = currentBattle.artistB;
          updateData.status = 'finished';
          updateData.artistA = null;
          shouldUpdate = true;
          await addDoc(collection(db, 'battles', battleId, 'messages'), {
            senderId: 'system',
            text: `Artist A left. ${profilesRef.current[currentBattle.artistB]?.username || 'Artist B'} wins by default!`,
            timestamp: Date.now()
          });
        } else if (currentBattle.artistB === profile.uid && currentBattle.artistA) {
          updateData.winner = currentBattle.artistA;
          updateData.status = 'finished';
          updateData.artistB = null;
          shouldUpdate = true;
          await addDoc(collection(db, 'battles', battleId, 'messages'), {
            senderId: 'system',
            text: `Artist B left. ${profilesRef.current[currentBattle.artistA]?.username || 'Artist A'} wins by default!`,
            timestamp: Date.now()
          });
        }
      }

      if (shouldUpdate) {
        console.log("[Arena] Updating battle state for leave:", updateData);
        await updateDoc(doc(db, 'battles', battleId), updateData);
      }
      
      // 4. Disconnect LiveKit
      disconnectLiveKit();
      
    } catch (error) {
      console.error("[Arena] Error during handleLeave:", error);
      handleFirestoreError(error, OperationType.WRITE, `battles/${battleId}`);
    }
  }, [battleId, profile, disconnectLiveKit]);

  // Handle tab closure / navigation
  useEffect(() => {
    const onBeforeUnload = () => {
      handleLeave();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onBeforeUnload);
    };
  }, [handleLeave]);

  const connectionStateRef = useRef(connectionState);
  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  const [connectionTimeout, setConnectionTimeout] = useState(false);

  // LiveKit Connection
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    if (battleId && profile?.uid) {
      console.log("[Arena] Initiating LiveKit connection for battle:", battleId);
      
      // Set a timeout to show a "taking longer than expected" message
      timeoutId = setTimeout(() => {
        if (isMounted && connectionStateRef.current === ConnectionState.Connecting) {
          console.warn("[Arena] LiveKit connection is taking longer than expected...");
          setConnectionTimeout(true);
        }
      }, 15000);

      connectLiveKit(battleId).catch(err => {
        if (isMounted) {
          clearTimeout(timeoutId);
          // Ignore "Client initiated disconnect" as it's usually a normal cleanup
          if (err?.message?.includes('Client initiated disconnect')) return;
          console.error("Failed to connect to LiveKit:", err);
        }
      });
    }
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      disconnectLiveKit();
    };
  }, [battleId, profile?.uid, connectLiveKit, disconnectLiveKit]);

  // Stale Role Cleanup Logic
  // If a role is assigned in Firestore but the user is not in the LiveKit room,
  // show "Disconnected" for 3 seconds, then clear the role so others can join.
  useEffect(() => {
    if (!battle || !battleId || connectionState !== ConnectionState.Connected || !profile?.uid) return;

    // Optimization: Only the "first" participant in the room performs the cleanup
    // to avoid multiple clients writing to Firestore at once.
    const allIdentities = [...lkParticipants.map(p => p.identity), profile.uid].sort();
    const isFirstParticipant = allIdentities[0] === profile.uid;
    if (!isFirstParticipant) return;

    const roles = ['artistA', 'artistB', 'judge1', 'judge2'] as const;
    const timers: NodeJS.Timeout[] = [];

    roles.forEach(role => {
      const assignedUid = battle[role];
      if (!assignedUid) return;

      // Check if participant is in LiveKit (remote or local)
      const isPresent = lkParticipants.some(p => p.identity === assignedUid) || (profile?.uid === assignedUid);
      
      if (!isPresent) {
        console.log(`[Arena] Role ${role} (${assignedUid}) is stale. Starting 3s cleanup timer...`);
        const timer = setTimeout(async () => {
          try {
            // Double check if still not present before writing to Firestore
            // (The effect re-running will clear this timer if they re-join)
            console.log(`[Arena] Cleaning up stale role ${role} (${assignedUid}) after 3s disconnect`);
            await updateDoc(doc(db, 'battles', battleId), {
              [role]: null
            });
          } catch (error) {
            console.error(`[Arena] Failed to cleanup stale role ${role}:`, error);
          }
        }, 3000);
        timers.push(timer);
      }
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [battle, lkParticipants, profile?.uid, battleId, connectionState]);

  const handleJoinRole = useCallback(async (role: 'artistA' | 'artistB' | 'judge1' | 'judge2') => {
    if (!battleId || !profile || !battle) return;
    try {
      const updateData: any = { [role]: profile.uid };
      
      // Remove from other roles if present
      if (battle.artistA === profile.uid && role !== 'artistA') updateData.artistA = null;
      if (battle.artistB === profile.uid && role !== 'artistB') updateData.artistB = null;
      if (battle.judge1 === profile.uid && role !== 'judge1') updateData.judge1 = null;
      if (battle.judge2 === profile.uid && role !== 'judge2') updateData.judge2 = null;

      await updateDoc(doc(db, 'battles', battleId), updateData);
      showNotification(`Joined as ${role.replace(/([A-Z]|\d)/g, ' $1').trim()}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `battles/${battleId}`);
    }
  }, [battleId, profile, battle]);

  // Auto-assign role if user joins without one
  useEffect(() => {
    if (battle && profile && !isArtist && !isJudge && !isLockedSpectator) {
      const preferredRole = localStorage.getItem('arenaRole');
      if (preferredRole === 'artist') {
        if (!battle.artistA) handleJoinRole('artistA');
        else if (!battle.artistB) handleJoinRole('artistB');
      } else if (preferredRole === 'judge') {
        if (!battle.judge1) handleJoinRole('judge1');
        else if (!battle.judge2) handleJoinRole('judge2');
      }
    }
  }, [battle, profile, isArtist, isJudge, isLockedSpectator, handleJoinRole]);

  // Auto-start media initialization
  useEffect(() => {
    if (battle && profile && !isLockedSpectator) {
      const initMedia = async () => {
        console.log("[Arena] Auto-starting media initialization...");
        try {
          const stream = await startMedia();
          if (stream) {
            console.log("[Arena] Media initialization successful");
          } else {
            console.warn("[Arena] Media initialization returned no stream");
          }
        } catch (err) {
          console.error("[Arena] Media initialization failed:", err);
        }
      };
      initMedia();
    }
  }, [battle?.id, profile?.uid, isLockedSpectator, startMedia]);

  // Auto-enable media on join
  useEffect(() => {
    if (connectionState === ConnectionState.Connected && !isLockedSpectator) {
      const autoEnable = async () => {
        // Use top-level derived states
        const hasRole = isArtist || isJudge;

        if (hasRole) {
          console.log("[Arena] User has role (artist/judge), ensuring media is enabled");
          if (!isMicOn) {
            console.log("[Arena] Auto-enabling microphone for role");
            await toggleMicLocal();
          }
        } else {
          // For spectators, we might still want to auto-enable if they have devices, 
          // but maybe less aggressively.
          if (!isMicOn && hasAudioDevice) {
            console.log("[Arena] Auto-enabling microphone for spectator");
            await toggleMicLocal();
          }
        }
      };
      autoEnable();
    }
  }, [connectionState, isLockedSpectator, battle?.artistA, battle?.artistB, battle?.judges, profile?.uid]);

  // Sync Local Media State to LiveKit
  useEffect(() => {
    let isEffectActive = true;
    desiredMediaStateRef.current = { mic: isMicOn, camera: false }; // Camera always false
    
    if (lkRoom?.localParticipant && connectionState === ConnectionState.Connected) {
      const syncMedia = async (retries = 5) => {
        if (!isEffectActive) return;
        if (isSyncingMediaRef.current) {
          console.log("[Arena] Media sync already in progress, skipping...");
          return;
        }
        
        isSyncingMediaRef.current = true;
        
        try {
          // Wait for engine to be fully ready. 
          // Initial wait is longer to ensure publisher is ready.
          const waitTime = retries === 5 ? 5000 : 3000;
          await new Promise(resolve => setTimeout(resolve, waitTime));

          if (!isEffectActive) return;
          if (!lkRoom || lkRoom.state !== ConnectionState.Connected) {
            console.warn("[Arena] Skipping media sync: Room not connected");
            isSyncingMediaRef.current = false;
            return;
          }

          const localP = lkRoom.localParticipant;
          const { mic: targetMic } = desiredMediaStateRef.current;

          console.log(`[Arena] Syncing media: targetMic=${targetMic} (retries=${retries})`);

          // Sync Microphone
          try {
            const currentMicPub = localP.getTrackPublication(LKTrack.Source.Microphone);
            const isCurrentlyMicEnabled = currentMicPub?.isEnabled || false;
            
            if (targetMic !== isCurrentlyMicEnabled || (targetMic && !currentMicPub)) {
              console.log(`[Arena] Setting microphone: ${targetMic}`);
              // Use a timeout for the publish operation itself to catch stalls
              const publishPromise = localP.setMicrophoneEnabled(targetMic && hasAudioDevice);
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Publishing timeout")), 15000)
              );
              
              await Promise.race([publishPromise, timeoutPromise]);
            }
          } catch (err: any) {
            const isEngineError = err?.message?.includes('engine not connected') || 
                                 err?.message?.includes('timeout') || 
                                 err?.message?.includes('rejected');
            
            if (retries > 0 && isEngineError) {
              console.warn(`[Arena] Mic sync failed (${err.message}), retrying in 3s... (${retries} left)`);
              if (mediaSyncTimeoutRef.current) clearTimeout(mediaSyncTimeoutRef.current);
              mediaSyncTimeoutRef.current = setTimeout(() => {
                isSyncingMediaRef.current = false; // Reset so retry can run
                syncMedia(retries - 1);
              }, 3000);
              return;
            }
            throw err;
          }

          // Ensure Camera is OFF
          try {
            const currentCamPub = localP.getTrackPublication(LKTrack.Source.Camera);
            if (currentCamPub?.isEnabled) {
              console.log("[Arena] Disabling camera (audio-only arena)");
              await localP.setCameraEnabled(false);
            }
          } catch (err) {
            console.warn("[Arena] Failed to ensure camera is off:", err);
          }

          console.log("[Arena] Media sync completed successfully");
        } catch (err: any) {
          console.error(`[Arena] LiveKit Media Sync Error:`, err);
          if (err?.name === 'NotFoundError' || err?.message?.includes('device not found')) {
            if (err.message.includes('audio')) setHasAudioDevice(false);
          }
        } finally {
          isSyncingMediaRef.current = false;
          // Check if state changed while we were syncing
          if (isEffectActive && desiredMediaStateRef.current.mic !== isMicOn) {
             console.log("[Arena] Media state changed during sync, re-triggering...");
             syncMedia();
          }
        }
      };
      
      syncMedia();
    }

    return () => {
      isEffectActive = false;
      if (mediaSyncTimeoutRef.current) clearTimeout(mediaSyncTimeoutRef.current);
    };
  }, [lkRoom, isMicOn, connectionState, hasAudioDevice]);

  // Sync Local Media State to Firestore
  useEffect(() => {
    if (battleId && profile) {
      const participantRef = doc(db, 'battles', battleId, 'participants', profile.uid);
      setDoc(participantRef, {
        isMicOn
      }, { merge: true }).catch(err => {
        console.warn("[Arena] Failed to update participant status in Firestore", err);
      });
    }
  }, [battleId, profile?.uid, isMicOn]);

  const audioRefA = useRef<HTMLAudioElement | null>(null);
  const audioRefB = useRef<HTMLAudioElement | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<{ [uid: string]: any }>({});
  const [mutedRemoteUsers, setMutedRemoteUsers] = useState<{ [uid: string]: boolean }>({});
  const joinedAt = useRef<number>(Date.now());

  const profileListeners = useRef<{ [uid: string]: () => void }>({});

  // Real-time Profile Syncing
  useEffect(() => {
    if (!battleId) return;
    
    const uids = new Set([
      battle?.artistA, 
      battle?.artistB, 
      battle?.judge1, 
      battle?.judge2,
      ...messages.map(m => m.senderId)
    ].filter(Boolean) as string[]);
    
    uids.forEach(uid => {
      if (!uid) return;
      if (!profileListeners.current[uid]) {
        console.log(`[Arena] Starting profile listener for ${uid}`);
        profileListeners.current[uid] = onSnapshot(doc(db, 'users', uid), (snap) => {
          if (snap.exists()) {
            const userData = snap.data() as UserProfile;
            console.log(`[Arena] Profile loaded for ${uid}:`, userData.username);
            setProfiles(prev => ({ ...prev, [uid]: userData }));
          } else {
            console.warn(`[Arena] Profile NOT found in Firestore for ${uid}`);
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${uid}`);
        });
      }
    });
  }, [battle?.artistA, battle?.artistB, battle?.judge1, battle?.judge2, messages.length]);

  useEffect(() => {
    return () => {
      Object.values(profileListeners.current).forEach(unsub => {
        if (typeof unsub === 'function') unsub();
      });
      profileListeners.current = {};
    };
  }, []);

  // Auto-assign role if joining without one
  useEffect(() => {
    if (!battle || !profile || isLockedSpectator) return;

    const currentRole = localStorage.getItem('arenaRole');
    const isAlreadyAssigned = 
      battle.artistA === profile.uid || 
      battle.artistB === profile.uid || 
      battle.judge1 === profile.uid || 
      battle.judge2 === profile.uid;

    if (!isAlreadyAssigned && currentRole) {
      const tryAssign = async () => {
        if (currentRole === 'artist') {
          if (!battle.artistA) await handleJoinRole('artistA' as any);
          else if (!battle.artistB) await handleJoinRole('artistB');
        } else if (currentRole === 'judge') {
          if (!battle.judge1) await handleJoinRole('judge1');
          else if (!battle.judge2) await handleJoinRole('judge2');
        }
      };
      tryAssign();
    }
  }, [battle?.id, profile?.uid]);

  // LiveKit handles the connection automatically via the connectLiveKit effect
  useEffect(() => {
    if (!battleId || !profile) return;

    const registerParticipant = async () => {
      try {
        // Register as participant in Firestore for metadata
        const participantRef = doc(db, 'battles', battleId, 'participants', profile.uid);
        await setDoc(participantRef, {
          uid: profile.uid,
          username: profile.username,
          photoURL: profile.photoURL,
          joinedAt: Date.now(),
          isMicOn
        });

        // Add system message for joining
        await addDoc(collection(db, 'battles', battleId, 'messages'), {
          senderId: 'system',
          text: `${profile.username} has joined the arena.`,
          timestamp: Date.now()
        });

        // Listen for other participants status
        const participantsRef = collection(db, 'battles', battleId, 'participants');
        const unsubParticipants = onSnapshot(participantsRef, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const otherUid = change.doc.id;
            const otherData = change.doc.data();
            
            if (change.type === 'added' || change.type === 'modified') {
              setRemoteParticipants(prev => ({ ...prev, [otherUid]: otherData }));
            }

            if (change.type === 'removed') {
              setRemoteParticipants(prev => {
                const next = { ...prev };
                delete next[otherUid];
                return next;
              });
            }
          });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `battles/${battleId}/participants`);
        });

        return () => {
          unsubParticipants();
          handleLeave();
        };
      } catch (err) {
        console.error("[Arena] Failed to register participant", err);
      }
    };

    registerParticipant();
  }, [battleId, profile?.uid]);

  const toggleMicLocal = async () => {
    if (!profile || !battleId) return;
    toggleMic();
    try {
      await setDoc(doc(db, 'battles', battleId, 'participants', profile.uid), { isMicOn: !isMicOn }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `battles/${battleId}/participants/${profile.uid}`);
    }
  };

  // LiveKit handles the connection automatically via the connectLiveKit effect

  const toggleRemoteMute = (uid: string) => {
    setMutedRemoteUsers(prev => ({ ...prev, [uid]: !prev[uid] }));
  };

  // Phase durations (ms)
  const SELECTION_TIME = 30000;
  const BATTLE_TIME = 180000; // 3 minutes
  const JUDGE_TIME = 30000;

  useEffect(() => {
    if (!battleId) return;
    const unsub = onSnapshot(doc(db, 'battles', battleId), async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as BattleState;
        setBattle({ ...data, id: snapshot.id });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `battles/${battleId}`);
    });

    // Messages
    const q = query(collection(db, 'battles', battleId, 'messages'), orderBy('timestamp', 'asc'), limit(50));
    const unsubMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `battles/${battleId}/messages`);
    });

    // Participants Status
    const unsubParticipants = onSnapshot(collection(db, 'battles', battleId, 'participants'), (snapshot) => {
      const participants: { [uid: string]: any } = {};
      snapshot.docs.forEach(d => {
        participants[d.id] = d.data();
      });
      setRemoteParticipants(participants);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `battles/${battleId}/participants`);
    });

    return () => {
      unsub();
      unsubMessages();
      unsubParticipants();
    };
  }, [battleId]);

  // Timer Logic
  useEffect(() => {
    if (!battle) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - battle.phaseStartTime;
      let duration = 0;

      if (battle.status === 'selection') duration = SELECTION_TIME;
      else if (battle.status === 'active') duration = BATTLE_TIME;
      else if (battle.status === 'voting') duration = JUDGE_TIME * 2;
      else if (battle.status === 'finished') duration = 0;

      const remaining = Math.max(0, Math.floor((duration - elapsed) / 1000));
      setTimeLeft(remaining);

      // Auto-transition phases (In a real app, use Cloud Functions)
      if (remaining === 0 && profile?.uid === battle.artistA && battle.status !== 'finished') {
        handlePhaseTransition();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [battle, profile]);

  const handlePhaseTransition = async () => {
    if (!battle || !battleId) return;
    
    if (battle.status === 'selection') {
      await updateDoc(doc(db, 'battles', battleId), {
        status: 'active',
        phaseStartTime: Date.now()
      });
      showNotification("Battle Started!");
    } else if (battle.status === 'active') {
      await updateDoc(doc(db, 'battles', battleId), {
        status: 'voting',
        phaseStartTime: Date.now()
      });
      showNotification("Voting Phase Begins!");
    } else if (battle.status === 'voting') {
      const votesA = Object.values(battle.votes).filter(v => v === battle.artistA).length;
      const votesB = Object.values(battle.votes).filter(v => v === battle.artistB).length;
      const winner = votesA > votesB ? battle.artistA : (votesB > votesA ? battle.artistB : 'draw');

      await updateDoc(doc(db, 'battles', battleId), {
        status: 'finished',
        winner,
        phaseStartTime: Date.now()
      });
      showNotification("Battle Finished!");
    }
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !battleId || !profile) return;

    setIsUploading(true);
    try {
      const fileRef = ref(storage, `battles/${battleId}/${profile.uid}_track`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      
      await updateDoc(doc(db, 'battles', battleId), {
        [`tracks.${profile.uid}`]: url
      });
      showNotification("Track Uploaded!");
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const togglePlayback = async (artistUid: string) => {
    if (!battle || !battleId) return;
    
    const isA = artistUid === battle.artistA;
    const audio = isA ? audioRefA.current : audioRefB.current;
    
    if (battle.currentPlayingArtist === artistUid) {
      // Pause
      await updateDoc(doc(db, 'battles', battleId), {
        currentPlayingArtist: null
      });
    } else {
      // Play
      await updateDoc(doc(db, 'battles', battleId), {
        currentPlayingArtist: artistUid
      });
    }
  };

  useEffect(() => {
    if (!battle) return;
    
    const audioA = audioRefA.current;
    const audioB = audioRefB.current;
    
    if (battle.currentPlayingArtist === battle.artistA) {
      audioB?.pause();
      audioA?.play().catch(() => {});
      setActiveTrack(battle.artistA);
    } else if (battle.currentPlayingArtist === battle.artistB) {
      audioA?.pause();
      audioB?.play().catch(() => {});
      setActiveTrack(battle.artistB);
    } else {
      audioA?.pause();
      audioB?.pause();
      setActiveTrack(null);
    }
  }, [battle?.currentPlayingArtist]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !battleId || !profile) return;

    await addDoc(collection(db, 'battles', battleId, 'messages'), {
      senderId: profile.uid,
      senderName: profile.username,
      senderPhoto: profile.photoURL,
      text: newMessage,
      timestamp: Date.now()
    });
    setNewMessage('');
  };

  const handleSendGif = async (gifUrl: string) => {
    if (!battleId || !profile) return;
    setShowGifPicker(false);
    
    try {
      await addDoc(collection(db, 'battles', battleId, 'messages'), {
        senderId: profile.uid,
        senderName: profile.username,
        senderPhoto: profile.photoURL,
        text: 'Sent a GIF',
        gifUrl,
        timestamp: Date.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `battles/${battleId}/messages`);
    }
  };

  const handleVote = async (artistUid: string) => {
    if (!battleId || !profile) return;
    
    await updateDoc(doc(db, 'battles', battleId), {
      [`votes.${profile.uid}`]: artistUid
    });
    showNotification("Vote Cast!");
  };

  // Resume AudioContext on interaction
  useEffect(() => {
    const resumeAudio = () => {
      if (window.AudioContext) {
        // We can't easily access all AudioContexts, but resuming the global one helps
        // In ParticipantBox, we'll handle it specifically
      }
    };
    window.addEventListener('click', resumeAudio);
    return () => window.removeEventListener('click', resumeAudio);
  }, []);

  if (!battle) return null;

  return (
    <LiveKitRoom room={lkRoom || undefined}>
      <ArenaContent 
        battle={battle}
        profile={profile}
        profiles={profiles}
        messages={messages}
        newMessage={newMessage}
        setNewMessage={setNewMessage}
        timeLeft={timeLeft}
        activeTrack={activeTrack}
        notification={notification}
        showGifPicker={showGifPicker}
        setShowGifPicker={setShowGifPicker}
        activeUserMenu={activeUserMenu}
        setActiveUserMenu={setActiveUserMenu}
        handleLeave={handleLeave}
        handleJoinRole={handleJoinRole}
        handleSendMessage={handleSendMessage}
        handleSendGif={handleSendGif}
        handleVote={handleVote}
        togglePlayback={togglePlayback}
        audioRefA={audioRefA}
        audioRefB={audioRefB}
        remoteParticipants={remoteParticipants}
        mutedRemoteUsers={mutedRemoteUsers}
        toggleRemoteMute={toggleRemoteMute}
        isMicOn={isMicOn}
        toggleMicLocal={toggleMicLocal}
        hasAudioDevice={hasAudioDevice}
        contextMediaError={contextMediaError}
        startMedia={startMedia}
        connectionState={connectionState}
        connectionError={connectionError}
        connectLiveKit={connectLiveKit}
        lkRoom={lkRoom}
        lkParticipants={lkParticipants}
        getParticipant={getParticipant}
        isLockedSpectator={isLockedSpectator}
        connectionTimeout={connectionTimeout}
      />
    </LiveKitRoom>
  );
}

const ArenaContent = ({ 
  battle, 
  profile, 
  profiles, 
  messages, 
  newMessage, 
  setNewMessage, 
  timeLeft, 
  activeTrack, 
  notification, 
  showGifPicker, 
  setShowGifPicker, 
  activeUserMenu, 
  setActiveUserMenu, 
  handleLeave, 
  handleJoinRole, 
  handleSendMessage, 
  handleSendGif, 
  handleVote, 
  togglePlayback, 
  audioRefA, 
  audioRefB, 
  remoteParticipants, 
  mutedRemoteUsers, 
  toggleRemoteMute, 
  isMicOn, 
  toggleMicLocal, 
  hasAudioDevice, 
  contextMediaError, 
  startMedia, 
  connectionState, 
  connectionError, 
  connectLiveKit, 
  lkRoom, 
  lkParticipants, 
  getParticipant,
  isLockedSpectator,
  connectionTimeout
}: any) => {
  const navigate = useNavigate();
  const [audioEnabled, setAudioEnabled] = useState(false);
  const tracks = useTracks([LKTrack.Source.Microphone]);
  const hasAnyTrack = tracks.length > 0;
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      console.log(`[Arena] Room connected. Audio tracks found: ${tracks.length}`);
      tracks.forEach(t => {
        if (t.publication?.isSubscribed) {
          console.log(`[Arena] Subscribed to remote audio track from ${t.participant.identity}`);
        }
      });
    }
  }, [connectionState, tracks.length]);

  const isConnecting = connectionState === ConnectionState.Connecting || (connectionState === ConnectionState.Disconnected && !connectionError);
  // Only wait for audio tracks if the battle is active
  const showLoading = isConnecting || (connectionState === ConnectionState.Connected && !hasAnyTrack && battle.status === 'active');

  const isArtist = profile?.uid === battle.artistA || profile?.uid === battle.artistB;
  const isArtistA = profile?.uid === battle.artistA;
  const isArtistB = profile?.uid === battle.artistB;
  const isJudge = profile?.uid === battle.judge1 || profile?.uid === battle.judge2;
  
  const isSpectator = isLockedSpectator || (!isArtist && !isJudge);
  const hasVoted = battle.votes[profile?.uid || ''];

  useEffect(() => {
    console.log("[ArenaContent] Mapping Debug:", {
      artistA: battle.artistA,
      artistB: battle.artistB,
      judge1: battle.judge1,
      judge2: battle.judge2,
      localUid: profile?.uid,
      isArtistA,
      isArtistB,
      isJudge,
      profilesCount: Object.keys(profiles).length
    });
  }, [battle.artistA, battle.artistB, battle.judge1, battle.judge2, profile?.uid, profiles, isArtistA, isArtistB, isJudge]);

  if (showLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-red-600/20 border-t-red-600 rounded-full animate-spin" />
          <Sword className="absolute inset-0 m-auto w-8 h-8 text-red-600 animate-pulse" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black uppercase tracking-tighter italic text-white">Connecting to Arena</h2>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">
            {connectionState === ConnectionState.Connected 
              ? "Waiting for media feed..." 
              : connectionTimeout 
                ? "Still trying to establish secure link... (Network might be slow)" 
                : "Establishing secure link..."}
          </p>
          {connectionTimeout && (
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-[10px] font-black uppercase tracking-[0.2em] transition-colors"
            >
              Retry Connection
            </button>
          )}
        </div>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="w-20 h-20 bg-red-600/10 rounded-full flex items-center justify-center border border-red-600/20 mb-4">
          <X className="w-10 h-10 text-red-600" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-2xl font-black uppercase tracking-tighter italic text-white">Connection Failed</h2>
          <p className="text-zinc-400 text-sm font-medium leading-relaxed">
            {connectionError}
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button 
            onClick={() => battle.id && connectLiveKit(battle.id)}
            className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2"
          >
            Retry Connection
          </button>
          <button 
            onClick={() => navigate('/arena')}
            className="w-full py-4 bg-white/5 hover:bg-white/10 text-zinc-400 font-black uppercase tracking-widest rounded-2xl transition-all"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  console.log(`[ArenaContent] Rendering with:`, {
    battleId: battle.id,
    status: battle.status,
    artistA: battle.artistA,
    artistB: battle.artistB,
    judge1: battle.judge1,
    judge2: battle.judge2,
    localUid: profile?.uid,
    isArtistA,
    isArtistB,
    isJudge,
    isSpectator
  });

  return (
    <div className="relative h-full flex flex-col gap-4 md:gap-6 px-4 md:px-6 pb-4 md:pb-6 overflow-hidden">
      {/* Audio Tracks for all remote participants */}
      {tracks.map(t => (
        <AudioTrack 
          key={t.publication.trackSid} 
          trackRef={t} 
          muted={mutedRemoteUsers[t.participant.identity]} 
        />
      ))}

      {/* Audio Enablement Overlay */}
      <AnimatePresence>
        {!audioEnabled && connectionState === ConnectionState.Connected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center p-6"
          >
            <div className="glass-panel p-8 rounded-[2.5rem] border border-red-600/20 max-w-sm w-full text-center space-y-6 neo-shadow">
              <div className="w-20 h-20 bg-red-600/10 rounded-full flex items-center justify-center mx-auto border border-red-600/20">
                <Volume2 className="w-10 h-10 text-red-600 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black uppercase tracking-tighter italic text-white">Enable Audio</h3>
                <p className="text-zinc-400 text-sm font-medium leading-relaxed">
                  Click below to join the voice channel and hear other participants.
                </p>
              </div>
              <button 
                onClick={async () => {
                  setAudioEnabled(true);
                  if (lkRoom) {
                    try {
                      await lkRoom.startAudio();
                      console.log("[Arena] Audio started successfully via startAudio()");
                    } catch (err) {
                      console.error("[Arena] Failed to start audio:", err);
                    }
                  }
                }}
                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2"
              >
                Join Voice Channel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[20%] right-[-5%] w-[30%] h-[30%] bg-red-900/10 blur-[100px] rounded-full animate-pulse" />
        <div className="absolute bottom-[10%] left-[-5%] w-[30%] h-[30%] bg-zinc-900/20 blur-[100px] rounded-full" />
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.5 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] bg-red-600 text-white px-8 py-4 rounded-full font-black uppercase tracking-widest shadow-[0_0_40px_rgba(220,38,38,0.6)]"
          >
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Media Error Overlay */}
      <AnimatePresence>
        {contextMediaError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <div className="glass-panel p-8 rounded-[2.5rem] border border-red-600/20 max-w-md w-full text-center space-y-6 neo-shadow">
              <div className="w-20 h-20 bg-red-600/10 rounded-full flex items-center justify-center mx-auto border border-red-600/20">
                <MicOff className="w-10 h-10 text-red-600" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black uppercase tracking-tighter italic text-white">Media Access Required</h3>
                <p className="text-zinc-400 text-sm font-medium leading-relaxed">
                  {contextMediaError}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => startMedia()}
                  className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg"
                >
                  Retry Connection
                </button>
                <button 
                  onClick={() => navigate('/arena')}
                  className="w-full py-4 bg-white/5 hover:bg-white/10 text-zinc-400 font-black uppercase tracking-widest rounded-2xl transition-all"
                >
                  Back to Lobby
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Arena Header - Sticky below Navbar */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-30 flex flex-col sm:flex-row items-center justify-between glass-panel p-4 md:p-5 rounded-b-2xl md:rounded-b-3xl border-x border-b border-zinc-800/50 neo-shadow gap-4 sm:gap-0"
      >
        <div className="flex items-center gap-3 md:gap-5 w-full sm:w-auto">
          <div className="bg-red-600/10 p-3 md:p-4 rounded-xl md:rounded-2xl border border-red-600/20">
            <Sword className="w-5 h-5 md:w-7 md:h-7 text-red-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg md:text-2xl font-black uppercase tracking-tighter italic leading-none mb-1 truncate">
              {battle.isCustom ? `Room: ${battle.roomCode}` : `Arena Battle #${battle.id?.slice(-4)}`}
            </h2>
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-1.5 h-1.5 md:w-2 md:h-2 rounded-full animate-pulse",
                battle.status === 'active' ? "bg-red-600" : "bg-zinc-600"
              )} />
              <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                {battle.status} Phase • Round 1/1
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="flex items-center gap-3 md:gap-4 text-3xl md:text-5xl font-black tabular-nums tracking-tighter bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(220,38,38,0.3)]">
            <Clock className="w-6 h-6 md:w-8 md:h-8 text-red-600 animate-pulse" />
            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
          </div>
          <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.4em] text-red-600/60 mt-1">Battle Countdown</span>
        </div>

        <div className="flex items-center gap-3 sm:gap-6">
          <div className="hidden sm:flex items-center gap-4">
            <div className="flex -space-x-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-[#050505] bg-zinc-900 flex items-center justify-center text-[8px] md:text-[10px] font-bold shadow-lg">
                  <Users className="w-3 h-3 md:w-4 md:h-4 text-zinc-400" />
                </div>
              ))}
            </div>
            <div className="text-right">
              <span className="block text-xs md:text-sm font-black text-white leading-none">12</span>
              <span className="text-[8px] md:text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Spectators</span>
            </div>
          </div>
          
          <button 
            onClick={() => {
              handleLeave();
              navigate('/');
            }}
            className="px-4 md:px-6 py-2 md:py-3 bg-zinc-900/80 hover:bg-red-600/20 border border-white/5 hover:border-red-600/40 rounded-xl md:rounded-2xl text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 hover:text-red-500 transition-all flex items-center gap-2 group"
          >
            <span className="w-1.5 h-1.5 bg-zinc-600 group-hover:bg-red-600 rounded-full transition-colors" />
            <span className="hidden xs:inline">Leave Arena</span>
            <span className="xs:hidden">Leave</span>
          </button>
        </div>
      </motion.div>

      {/* Main Arena Layout */}
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row gap-4 md:gap-6 min-h-0 overflow-hidden">
        {/* Left Section: Participants & Stage */}
        <div className={cn(
          "flex-1 flex flex-col gap-4 md:gap-6 min-h-0 relative",
          isLockedSpectator && "pointer-events-none opacity-80" // Disable interaction for locked spectators
        )}>
          {/* Stage Overlays (Matchmaking, Voting, Results) - Now at the Top */}
          <AnimatePresence mode="wait">
            {battle.status !== 'active' && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="z-40 w-full"
              >
                <div className="glass-panel p-3 md:p-4 rounded-xl md:rounded-2xl border border-white/10 neo-shadow flex items-center justify-center gap-4 text-center">
                  {battle.status === 'waiting' && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-red-600/10 rounded-lg border border-red-600/20 flex items-center justify-center">
                        <Users className="w-4 h-4 text-red-600 animate-pulse" />
                      </div>
                      <div>
                        <h2 className="text-sm md:text-lg font-black uppercase tracking-tighter italic text-white leading-none">Matchmaking</h2>
                        <p className="text-zinc-500 text-[6px] md:text-[8px] font-black uppercase tracking-[0.2em]">Waiting for positions...</p>
                      </div>
                    </div>
                  )}
                  {battle.status === 'voting' && (
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-red-600" />
                        <h2 className="text-sm md:text-lg font-black uppercase tracking-tighter italic text-white">Voting</h2>
                      </div>
                      <div className="flex items-center gap-4 border-l border-white/10 pl-4">
                        <div className="text-center">
                          <div className="text-sm font-black text-white">{Object.values(battle.votes).filter(v => v === battle.artistA).length}</div>
                          <div className="text-[6px] font-black uppercase tracking-widest text-zinc-500">Votes A</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-black text-white">{Object.values(battle.votes).filter(v => v === battle.artistB).length}</div>
                          <div className="text-[6px] font-black uppercase tracking-widest text-zinc-500">Votes B</div>
                        </div>
                      </div>
                    </div>
                  )}
                  {battle.status === 'finished' && (
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-emerald-600" />
                        <h2 className="text-sm md:text-lg font-black uppercase tracking-tighter italic text-white">Winner:</h2>
                        <span className="text-emerald-500 text-sm md:text-lg font-black uppercase tracking-widest">
                          {battle.winner === 'draw' ? 'DRAW' : (battle.winner === battle.artistA ? profiles[battle.artistA]?.username : profiles[battle.artistB]?.username)}
                        </span>
                      </div>
                      <button 
                        onClick={() => navigate('/arena/lobby')}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all"
                      >
                        Lobby
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 4 Positions Grid - Together in the Middle */}
          <div className="grid grid-cols-2 gap-2 md:gap-4 flex-1 min-h-0 overflow-y-auto lg:overflow-visible no-scrollbar place-content-center">
            <ParticipantBox 
              assignedUid={battle.artistA}
              profile={profiles[battle.artistA] || (isArtistA ? profile : null)}
              role="Artist A"
              isLocal={isArtistA}
              participant={getParticipant(battle.artistA)}
              participantData={remoteParticipants[battle.artistA]}
              isActive={activeTrack === battle.artistA}
              onTogglePlayback={() => togglePlayback(battle.artistA)}
              onVote={() => handleVote(battle.artistA)}
              hasVoted={hasVoted}
              battleStatus={battle.status}
              trackUrl={battle.tracks[battle.artistA]}
              isArtistRole={true}
              isCurrentUserArtist={isArtist}
              isMicOn={isMicOn}
              toggleMic={toggleMicLocal}
              isRemoteMuted={mutedRemoteUsers[battle.artistA]}
              onToggleRemoteMute={() => toggleRemoteMute(battle.artistA)}
              mediaError={isArtistA ? contextMediaError : null}
            />
            <ParticipantBox 
              assignedUid={battle.artistB}
              profile={profiles[battle.artistB] || (isArtistB ? profile : null)}
              role="Artist B"
              isLocal={isArtistB}
              participant={getParticipant(battle.artistB)}
              participantData={remoteParticipants[battle.artistB]}
              isActive={activeTrack === battle.artistB}
              onTogglePlayback={() => togglePlayback(battle.artistB)}
              onVote={() => handleVote(battle.artistB)}
              hasVoted={hasVoted}
              battleStatus={battle.status}
              trackUrl={battle.tracks[battle.artistB]}
              isArtistRole={true}
              isCurrentUserArtist={isArtist}
              isMicOn={isMicOn}
              toggleMic={toggleMicLocal}
              onJoin={!battle.artistB && !isArtist && !isJudge && !isSpectator ? () => handleJoinRole('artistB') : null}
              isRemoteMuted={mutedRemoteUsers[battle.artistB]}
              onToggleRemoteMute={() => toggleRemoteMute(battle.artistB)}
              mediaError={isArtistB ? contextMediaError : null}
            />
            <ParticipantBox 
              assignedUid={battle.judge1}
              profile={profiles[battle.judge1 || ''] || (profile?.uid === battle.judge1 ? profile : null)}
              role="Judge 1"
              isLocal={profile?.uid === battle.judge1}
              participant={getParticipant(battle.judge1)}
              participantData={battle.judge1 ? remoteParticipants[battle.judge1] : null}
              isActive={activeTrack === battle.judge1} // Use activeTrack or speaking logic (speaking is handled inside ParticipantBox)
              hasVoted={hasVoted}
              battleStatus={battle.status}
              isArtistRole={false}
              isCurrentUserArtist={isArtist}
              isMicOn={isMicOn}
              toggleMic={toggleMicLocal}
              onJoin={!battle.judge1 && !isArtist && !isJudge && !isSpectator ? () => handleJoinRole('judge1') : null}
              isRemoteMuted={mutedRemoteUsers[battle.judge1]}
              onToggleRemoteMute={() => toggleRemoteMute(battle.judge1)}
              mediaError={profile?.uid === battle.judge1 ? contextMediaError : null}
            />
            <ParticipantBox 
              assignedUid={battle.judge2}
              profile={profiles[battle.judge2 || ''] || (profile?.uid === battle.judge2 ? profile : null)}
              role="Judge 2"
              isLocal={profile?.uid === battle.judge2}
              participant={getParticipant(battle.judge2)}
              participantData={battle.judge2 ? remoteParticipants[battle.judge2] : null}
              isActive={activeTrack === battle.judge2}
              hasVoted={hasVoted}
              battleStatus={battle.status}
              isArtistRole={false}
              isCurrentUserArtist={isArtist}
              isMicOn={isMicOn}
              toggleMic={toggleMicLocal}
              onJoin={!battle.judge2 && !isArtist && !isJudge && !isSpectator ? () => handleJoinRole('judge2') : null}
              isRemoteMuted={mutedRemoteUsers[battle.judge2]}
              onToggleRemoteMute={() => toggleRemoteMute(battle.judge2)}
              mediaError={profile?.uid === battle.judge2 ? contextMediaError : null}
            />
          </div>
        </div>

        {/* Right Section: Chat */}
        <div className="w-full lg:w-[400px] xl:w-[460px] flex flex-col h-[450px] lg:h-auto glass-panel rounded-2xl md:rounded-[3rem] border border-white/5 overflow-hidden neo-shadow bg-black/40 backdrop-blur-2xl shrink-0">
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-white/5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.8)]" />
              <span className="text-xs font-black uppercase tracking-[0.3em] text-white">Live Chat</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full">
              <Users className="w-3 h-3 text-red-600" />
              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">12 Online</span>
            </div>
          </div>
          
          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth"
          >
            {messages.map((msg, i) => {
              if (msg.senderId === 'system') {
                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={i} 
                    className="flex justify-center py-2"
                  >
                    <div className="bg-red-600/5 border border-red-600/10 px-6 py-2 rounded-full backdrop-blur-sm">
                      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-red-500/80 text-center">
                        {msg.text}
                      </p>
                    </div>
                  </motion.div>
                );
              }
              return (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={i} 
                  className="flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center shrink-0 overflow-hidden shadow-lg">
                    {profiles[msg.senderId]?.photoURL || msg.senderPhoto ? (
                      <img src={profiles[msg.senderId]?.photoURL || msg.senderPhoto} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="text-xs font-black text-zinc-700">{profiles[msg.senderId]?.username?.[0] || msg.senderName?.[0]}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 relative">
                    <div className="bg-white/5 hover:bg-white/10 transition-colors px-4 py-3 rounded-2xl rounded-tl-none border border-white/5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <button 
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setActiveUserMenu({ 
                              uid: msg.senderId, 
                              x: rect.left, 
                              y: rect.top 
                            });
                          }}
                          className="text-[9px] font-black text-red-600 uppercase tracking-widest truncate hover:underline"
                        >
                          {profiles[msg.senderId]?.username || msg.senderName}
                        </button>
                        <span className="text-[7px] font-bold text-zinc-600 uppercase">{format(msg.timestamp, 'HH:mm')}</span>
                      </div>
                      {msg.gifUrl ? (
                        <img src={msg.gifUrl} className="rounded-xl w-full max-w-[200px] mt-2 border border-white/10" referrerPolicy="no-referrer" />
                      ) : (
                        <p className="text-xs font-medium text-zinc-300 leading-relaxed break-words">
                          {msg.text}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* User Context Menu */}
          <AnimatePresence>
            {activeUserMenu && (
              <>
                <div 
                  className="fixed inset-0 z-[60]" 
                  onClick={() => setActiveUserMenu(null)} 
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  style={{ 
                    position: 'fixed',
                    left: Math.min(activeUserMenu.x, window.innerWidth - 160),
                    top: Math.max(20, activeUserMenu.y - 100),
                  }}
                  className="z-[70] w-40 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
                >
                  <Link 
                    to={`/profile/${activeUserMenu.uid}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all"
                  >
                    <User className="w-4 h-4 text-red-600" />
                    View Profile
                  </Link>
                  <Link 
                    to={`/messages?uid=${activeUserMenu.uid}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all border-t border-white/5"
                  >
                    <MessageSquare className="w-4 h-4 text-red-600" />
                    Send DM
                  </Link>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <form onSubmit={handleSendMessage} className="p-4 bg-black/60 border-t border-white/5 flex gap-3 relative">
            <div className="flex-1 relative flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="TYPE A MESSAGE..."
                  className="w-full bg-white/5 border-none rounded-2xl px-6 py-4 text-xs font-black uppercase tracking-widest focus:ring-2 focus:ring-red-600/50 placeholder:text-zinc-700 text-white"
                />
              </div>
              <button 
                type="button"
                onClick={() => setShowGifPicker(!showGifPicker)}
                className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shrink-0",
                  showGifPicker ? "bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)]" : "bg-white/5 text-zinc-500 hover:text-white"
                )}
              >
                <ImageIcon className="w-6 h-6" />
              </button>
              <AnimatePresence>
                {showGifPicker && (
                  <div className="fixed inset-x-2 bottom-24 md:absolute md:inset-auto md:bottom-full md:right-0 md:mb-4 z-50 w-[calc(100%-1rem)] md:w-auto">
                    <div className="glass-panel p-2 rounded-3xl border border-white/10 neo-shadow overflow-hidden">
                      <GifPicker 
                        onSelect={handleSendGif} 
                        onClose={() => setShowGifPicker(false)} 
                      />
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
            <button type="submit" className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center hover:bg-red-500 transition-all shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:scale-105 active:scale-95 shrink-0">
              <Send className="w-6 h-6 text-white" />
            </button>
          </form>
        </div>
      </div>

        {/* Artist Controls Overlay (Floating) - REMOVED */}
        
        {/* Hidden Audio Elements for Battle Tracks */}
        <audio ref={audioRefA} src={battle.tracks[battle.artistA]} crossOrigin="anonymous" />
        <audio ref={audioRefB} src={battle.tracks[battle.artistB]} crossOrigin="anonymous" />
      </div>
    );
};

const ParticipantBox = ({ 
  assignedUid,
  profile: p, 
  role, 
  isLocal, 
  participant: initialParticipant, 
  participantData,
  isActive: isTrackActive,
  onTogglePlayback,
  onVote,
  hasVoted,
  battleStatus,
  trackUrl,
  isArtistRole,
  isCurrentUserArtist,
  isMicOn,
  toggleMic,
  onJoin,
  isRemoteMuted,
  onToggleRemoteMute,
  mediaError
}: any) => {
  const { profile: localUser } = useAuth();
  const { activeSpeaker, connectionState } = useLiveKit();
  const { isSpeaking: lkIsSpeaking } = useParticipantInfo({ participant: initialParticipant }) as any;
  
  // Use both useParticipantInfo and the room's activeSpeaker for robustness
  const isSpeaking = lkIsSpeaking || (activeSpeaker?.identity === assignedUid);
  
  const micOn = isLocal ? isMicOn : participantData?.isMicOn;

  // Get tracks for this participant specifically
  // onlySubscribed: true ensures we only deal with tracks we can actually hear
  const allTracks = useTracks([
    LKTrack.Source.Microphone,
  ], { onlySubscribed: true });
  
  const audioTrack = allTracks.find(t => t.participant.identity === assignedUid && t.source === LKTrack.Source.Microphone);

  useEffect(() => {
    if (assignedUid && audioTrack) {
      console.log(`[ParticipantBox] ${role} (${assignedUid}) audio track found:`, {
        sid: audioTrack.publication.trackSid,
        isSubscribed: audioTrack.publication.isSubscribed,
        isEnabled: audioTrack.publication.isEnabled
      });
    }
  }, [assignedUid, !!audioTrack, role]);

  useEffect(() => {
    if (assignedUid) {
      console.log(`[ParticipantBox] ${role} (${assignedUid}) audio:`, {
        hasAudio: !!audioTrack,
        micOn,
        isLocal,
        isSpeaking
      });
    }
  }, [assignedUid, !!audioTrack, micOn, role, isSpeaking]);

  // Final active state: either track is playing or they are speaking
  const isActive = isTrackActive || isSpeaking;
  const isDisconnected = !initialParticipant && assignedUid && !isLocal;

  useEffect(() => {
    if (isActive && assignedUid) {
      console.log(`[ParticipantBox] ${role} (${assignedUid}) is ACTIVE (speaking/track)`);
    }
  }, [isActive, assignedUid, role]);

  if (!assignedUid || isDisconnected) {
    return (
      <div className="relative rounded-2xl md:rounded-[2.5rem] border-2 border-dashed border-white/10 overflow-hidden bg-zinc-900/20 aspect-square md:aspect-[4/5] flex flex-col items-center justify-center gap-1 md:gap-4 group hover:border-red-600/30 transition-all">
        <div className="w-10 h-10 md:w-24 md:h-24 rounded-full bg-zinc-900/50 border border-white/5 flex items-center justify-center text-zinc-700 group-hover:text-red-600/50 transition-colors">
          {isDisconnected ? <WifiOff className="w-5 h-5 md:w-12 md:h-12" /> : <Users className="w-5 h-5 md:w-12 md:h-12" />}
        </div>
        <div className="text-center">
          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 text-[6px] md:text-[7px] font-black uppercase tracking-widest mb-0.5 md:mb-2 inline-block">
            {role}
          </span>
          <h3 className="text-[8px] md:text-lg font-black uppercase tracking-tighter italic text-zinc-600">
            {isDisconnected ? 'Disconnected' : 'Available'}
          </h3>
          {isDisconnected && p?.username && (
            <p className="text-[8px] md:text-xs font-bold uppercase tracking-widest text-zinc-500 mt-1">
              {p.username}
            </p>
          )}
        </div>
        {onJoin && !isDisconnected && (
          <button 
            onClick={onJoin}
            className="px-3 md:px-6 py-1 md:py-2 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/20 rounded-lg md:rounded-xl text-[6px] md:text-[8px] font-black uppercase tracking-widest transition-all"
          >
            Join
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "relative rounded-2xl md:rounded-[2.5rem] border-2 group transition-all duration-500 neo-shadow bg-zinc-900/40 aspect-square md:aspect-[4/5] flex flex-col items-center justify-center p-2 md:p-4",
      isActive ? "border-red-600 shadow-[0_0_80px_rgba(220,38,38,0.6)] scale-[1.02] z-30 overflow-visible" : "border-white/5 overflow-hidden"
    )}>
      {/* Background Ambient Glow */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gradient-to-t from-red-900/30 via-red-900/5 to-transparent z-0"
          />
        )}
      </AnimatePresence>

      {/* Main Content Container */}
      <div className="relative z-10 flex flex-col items-center">
        <div className="relative">
          {/* Active Speaker Pulse */}
          <AnimatePresence>
            {isActive && (
              <>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: [1.2, 2.2, 1.2], opacity: [0.4, 0.6, 0.4] }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                  className="absolute -inset-16 bg-red-600 blur-[60px] rounded-full z-0"
                />
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: [1.1, 1.6, 1.1], opacity: [0.6, 0.9, 0.6] }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }}
                  className="absolute -inset-8 bg-red-500 blur-3xl rounded-full z-0"
                />
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute -inset-2 rounded-full border-4 border-red-500 z-20 animate-pulse shadow-[0_0_40px_rgba(239,68,68,1)]"
                />
              </>
            )}
          </AnimatePresence>

          {/* The Circle */}
          <div className={cn(
            "relative w-16 h-16 md:w-40 md:h-40 rounded-full overflow-hidden border-2 md:border-4 transition-all duration-500 z-10 bg-zinc-950",
            isActive ? "border-red-600 scale-110 shadow-[0_0_60px_rgba(220,38,38,0.8)] ring-4 ring-red-600/30" : "border-white/10"
          )}>
            {/* AudioTrack is now handled centrally in ArenaContent */}

            {/* Profile Photo Layer (Always shown in audio-only mode) */}
            <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-500 opacity-100 z-10">
              {p?.photoURL ? (
                <img 
                  src={p.photoURL} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                  onLoad={() => console.log(`[ParticipantBox] Image loaded for ${p.username}`)}
                  onError={() => console.error(`[ParticipantBox] Image FAILED to load for ${p.username}: ${p.photoURL}`)}
                />
              ) : (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="w-10 h-10 md:w-14 md:h-14 text-zinc-800" />
                    {assignedUid && <Loader2 className="w-4 h-4 text-zinc-700 animate-spin" />}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Red Glow Below the Circle */}
          <AnimatePresence>
            {isActive && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-16 h-2 bg-red-600 blur-md rounded-full z-20"
              />
            )}
          </AnimatePresence>
        </div>

        {/* Info Overlay */}
        <div className="mt-2 md:mt-6 text-center space-y-1 md:space-y-2">
          <div className="flex items-center justify-center gap-1 md:gap-2">
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[6px] md:text-[7px] font-black uppercase tracking-widest",
              isArtistRole ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
            )}>
              {role}
            </span>
            {trackUrl && (
              <button 
                onClick={onTogglePlayback}
                className={cn(
                  "w-5 h-5 md:w-6 md:h-6 rounded-lg flex items-center justify-center transition-all",
                  isActive ? "bg-red-600 text-white" : "bg-white/10 text-white hover:bg-white/20"
                )}
              >
                {isActive ? <Pause className="w-2.5 h-2.5 md:w-3 md:h-3" fill="white" /> : <Play className="w-2.5 h-2.5 md:w-3 md:h-3" fill="white" />}
              </button>
            )}
          </div>
          <h3 className="text-xs md:text-xl font-black uppercase tracking-tighter italic leading-none truncate text-white drop-shadow-lg max-w-[80px] md:max-w-none">
            {p?.username || 'Waiting...'}
          </h3>
        </div>

        {battleStatus === 'voting' && isArtistRole && !isCurrentUserArtist && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onVote}
            disabled={!!hasVoted}
            className={cn(
              "mt-4 px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all shadow-xl",
              hasVoted === p?.uid 
                ? "bg-emerald-600 text-white"
                : "bg-white text-black hover:bg-zinc-200"
            )}
          >
            {hasVoted === p?.uid ? 'Vote Cast' : `Vote for ${p?.username}`}
          </motion.button>
        )}
      </div>

      {/* Status Indicators */}
      <div className="absolute top-4 right-4 z-30 flex flex-col gap-2">
        {isLocal ? (
          <div className="flex flex-col gap-2">
            <button 
              onClick={toggleMic}
              className={cn(
                "p-2 rounded-xl backdrop-blur-xl border transition-all",
                isMicOn ? "bg-red-600 border-red-600/30 text-white" : "bg-black/60 border-white/5 text-zinc-600"
              )}
            >
              {isMicOn ? <Mic2 className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button 
              onClick={onToggleRemoteMute}
              className={cn(
                "p-2 rounded-xl backdrop-blur-xl border transition-all",
                !isRemoteMuted ? "bg-red-600/20 border-red-600/30 text-red-500" : "bg-black/60 border-white/5 text-zinc-600"
              )}
            >
              {!isRemoteMuted ? <Mic2 className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
