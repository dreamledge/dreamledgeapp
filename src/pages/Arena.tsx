import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Mic2, Video, VideoOff, MicOff, Play, Pause, Send, Users, Trophy, Sword, Loader2, Clock } from 'lucide-react';
import { db, storage, auth } from '../firebase';
import { doc, onSnapshot, updateDoc, arrayUnion, setDoc, getDoc, collection, addDoc, query, orderBy, limit, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth, UserProfile } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

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
  const navigate = useNavigate();
  
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [profiles, setProfiles] = useState<{ [uid: string]: UserProfile }>({});
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [activeTrack, setActiveTrack] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const audioRefA = useRef<HTMLAudioElement | null>(null);
  const audioRefB = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isMicOn, setIsMicOn] = useState(() => localStorage.getItem('micEnabled') !== 'false');
  const [isCameraOn, setIsCameraOn] = useState(() => localStorage.getItem('cameraEnabled') === 'true');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<{ [uid: string]: MediaStream }>({});
  const [remoteParticipants, setRemoteParticipants] = useState<{ [uid: string]: any }>({});
  const peerConnections = useRef<{ [uid: string]: RTCPeerConnection }>({});
  const joinedAt = useRef<number>(Date.now());

  const iceConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  // Real-time Profile Syncing
  useEffect(() => {
    if (!battle) return;
    const uids = [battle.artistA, battle.artistB, battle.judge1, battle.judge2].filter(Boolean) as string[];
    
    const unsubs = uids.map(uid => 
      onSnapshot(doc(db, 'users', uid), (snap) => {
        if (snap.exists()) {
          setProfiles(prev => ({ ...prev, [uid]: snap.data() as UserProfile }));
        }
      })
    );

    return () => unsubs.forEach(unsub => unsub());
  }, [battle?.artistA, battle?.artistB, battle?.judge1, battle?.judge2]);

  // WebRTC Setup
  useEffect(() => {
    if (!battleId || !profile) return;

    const setupMedia = async () => {
      try {
        // Try to get both, but fall back if one is missing
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true
          });
        } catch (e) {
          console.warn("Failed to get both audio and video, trying audio only", e);
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false
            });
          } catch (e2) {
            console.warn("Failed to get audio, trying video only", e2);
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: true
            });
          }
        }
        
        setLocalStream(stream);
        
        // Initially mute video if requested
        stream.getVideoTracks().forEach(track => track.enabled = isCameraOn);
        stream.getAudioTracks().forEach(track => track.enabled = isMicOn);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Register as participant
        const participantRef = doc(db, 'battles', battleId, 'participants', profile.uid);
        await setDoc(participantRef, {
          uid: profile.uid,
          username: profile.username,
          photoURL: profile.photoURL,
          joinedAt: Date.now(),
          isCameraOn,
          isMicOn
        });

        // Listen for other participants to connect
        const participantsRef = collection(db, 'battles', battleId, 'participants');
        const unsubParticipants = onSnapshot(participantsRef, (snapshot) => {
          snapshot.docChanges().forEach(async (change) => {
            const otherUid = change.doc.id;
            const otherData = change.doc.data();
            
            if (change.type === 'added' || change.type === 'modified') {
              setRemoteParticipants(prev => ({ ...prev, [otherUid]: otherData }));
            }

            if (otherUid === profile.uid) return;

            if (change.type === 'added') {
              // Tie-breaker to avoid double connections:
              // The user with the lexicographically smaller UID initiates the connection
              if (profile.uid < otherUid) {
                console.log(`Initiating connection to ${otherUid}`);
                initiateConnection(otherUid, stream);
              }
            } else if (change.type === 'removed') {
              closeConnection(otherUid);
              setRemoteParticipants(prev => {
                const next = { ...prev };
                delete next[otherUid];
                return next;
              });
            }
          });
        });

        // Listen for incoming signaling
        const signalingRef = collection(db, 'battles', battleId, 'signaling');
        const unsubSignaling = onSnapshot(signalingRef, (snapshot) => {
          snapshot.docChanges().forEach(async (change) => {
            const data = change.doc.data();
            const docId = change.doc.id;
            
            if (data.to !== profile.uid) return;
            // Ignore messages from before we joined
            if (data.timestamp < joinedAt.current) return;

            const fromUid = data.from;
            if (change.type === 'added') {
              if (data.type === 'offer') {
                handleOffer(fromUid, data.offer, stream);
              } else if (data.type === 'answer') {
                handleAnswer(fromUid, data.answer);
              } else if (data.type === 'candidate') {
                handleCandidate(fromUid, data.candidate);
              }
              
              // Clean up signaling message after processing
              try {
                await deleteDoc(doc(db, 'battles', battleId, 'signaling', docId));
              } catch (e) {
                // Ignore deletion errors (might have been deleted by other peer)
              }
            }
          });
        });

        return () => {
          unsubParticipants();
          unsubSignaling();
          stream.getTracks().forEach(t => t.stop());
          deleteDoc(participantRef);
        };
      } catch (err) {
        console.error("Failed to get media", err);
      }
    };

    setupMedia();
  }, [battleId, profile?.uid]);

  const initiateConnection = async (otherUid: string, stream: MediaStream) => {
    if (peerConnections.current[otherUid]) return;

    const pc = new RTCPeerConnection(iceConfig);
    peerConnections.current[otherUid] = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(collection(db, 'battles', battleId!, 'signaling'), {
          type: 'candidate',
          candidate: event.candidate.toJSON(),
          from: profile!.uid,
          to: otherUid,
          timestamp: Date.now()
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStreams(prev => ({
        ...prev,
        [otherUid]: event.streams[0]
      }));
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await addDoc(collection(db, 'battles', battleId!, 'signaling'), {
      type: 'offer',
      offer: { type: offer.type, sdp: offer.sdp },
      from: profile!.uid,
      to: otherUid,
      timestamp: Date.now()
    });
  };

  const handleOffer = async (fromUid: string, offer: any, stream: MediaStream) => {
    const pc = new RTCPeerConnection(iceConfig);
    peerConnections.current[fromUid] = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(collection(db, 'battles', battleId!, 'signaling'), {
          type: 'candidate',
          candidate: event.candidate.toJSON(),
          from: profile!.uid,
          to: fromUid,
          timestamp: Date.now()
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStreams(prev => ({
        ...prev,
        [fromUid]: event.streams[0]
      }));
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await addDoc(collection(db, 'battles', battleId!, 'signaling'), {
      type: 'answer',
      answer: { type: answer.type, sdp: answer.sdp },
      from: profile!.uid,
      to: fromUid,
      timestamp: Date.now()
    });
  };

  const handleAnswer = async (fromUid: string, answer: any) => {
    const pc = peerConnections.current[fromUid];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  const handleCandidate = async (fromUid: string, candidate: any) => {
    const pc = peerConnections.current[fromUid];
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  const closeConnection = (uid: string) => {
    if (peerConnections.current[uid]) {
      peerConnections.current[uid].close();
      delete peerConnections.current[uid];
      setRemoteStreams(prev => {
        const next = { ...prev };
        delete next[uid];
        return next;
      });
    }
  };

  const toggleMic = () => {
    const newState = !isMicOn;
    setIsMicOn(newState);
    localStream?.getAudioTracks().forEach(track => track.enabled = newState);
    if (battleId && profile) {
      updateDoc(doc(db, 'battles', battleId, 'participants', profile.uid), { isMicOn: newState });
    }
  };

  const toggleCamera = () => {
    const newState = !isCameraOn;
    setIsCameraOn(newState);
    localStream?.getVideoTracks().forEach(track => track.enabled = newState);
    if (battleId && profile) {
      updateDoc(doc(db, 'battles', battleId, 'participants', profile.uid), { isCameraOn: newState });
    }
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
      setMessages(snapshot.docs.map(d => d.data()));
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

  const handleJoinRole = async (role: 'artistB' | 'judge1' | 'judge2') => {
    if (!battleId || !profile || !battle) return;
    try {
      const updateData: any = { [role]: profile.uid };
      
      // Remove from other roles if present
      if (battle.artistA === profile.uid) updateData.artistA = null;
      if (battle.artistB === profile.uid && role !== 'artistB') updateData.artistB = null;
      if (battle.judge1 === profile.uid && role !== 'judge1') updateData.judge1 = null;
      if (battle.judge2 === profile.uid && role !== 'judge2') updateData.judge2 = null;

      await updateDoc(doc(db, 'battles', battleId), updateData);
      showNotification(`Joined as ${role === 'artistB' ? 'Artist B' : role === 'judge1' ? 'Judge 1' : 'Judge 2'}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `battles/${battleId}`);
    }
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

  const handleVote = async (artistUid: string) => {
    if (!battleId || !profile) return;
    
    await updateDoc(doc(db, 'battles', battleId), {
      [`votes.${profile.uid}`]: artistUid
    });
    showNotification("Vote Cast!");
  };

  if (!battle) return null;

  const isArtist = profile?.uid === battle.artistA || profile?.uid === battle.artistB;
  const isArtistA = profile?.uid === battle.artistA;
  const isArtistB = profile?.uid === battle.artistB;
  const isJudge = profile?.uid === battle.judge1 || profile?.uid === battle.judge2;
  
  // A spectator is someone who joined as a spectator from the lobby
  // We can track this by checking if they are NOT in any role AND they are in the participants collection
  // But the user wants them to ONLY have chat access if they chose "Random Spectator".
  // Let's use a search param or a local state to identify if they intended to be a spectator.
  const [isLockedSpectator] = useState(() => localStorage.getItem('arenaRole') === 'spectator');
  
  const isSpectator = isLockedSpectator || (!isArtist && !isJudge);
  const hasVoted = battle.votes[profile?.uid || ''];

  return (
    <div className="relative h-full flex flex-col gap-4 md:gap-6 px-4 md:px-6 pb-4 md:pb-6 overflow-hidden">
      {/* Background Elements */}
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
              {battle.isCustom ? `Room: ${battle.roomCode}` : `Arena Battle #${battleId?.slice(-4)}`}
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
              profile={profiles[battle.artistA]}
              role="Artist A"
              isLocal={isArtistA}
              stream={isArtistA ? localStream : remoteStreams[battle.artistA]}
              participantData={remoteParticipants[battle.artistA]}
              isActive={activeTrack === battle.artistA}
              onTogglePlayback={() => togglePlayback(battle.artistA)}
              onVote={() => handleVote(battle.artistA)}
              hasVoted={hasVoted}
              battleStatus={battle.status}
              trackUrl={battle.tracks[battle.artistA]}
              isArtistRole={true}
              isCurrentUserArtist={isArtist}
              isCameraOn={isCameraOn}
              isMicOn={isMicOn}
              toggleMic={toggleMic}
              toggleCamera={toggleCamera}
            />
            <ParticipantBox 
              profile={profiles[battle.artistB]}
              role="Artist B"
              isLocal={isArtistB}
              stream={isArtistB ? localStream : remoteStreams[battle.artistB]}
              participantData={remoteParticipants[battle.artistB]}
              isActive={activeTrack === battle.artistB}
              onTogglePlayback={() => togglePlayback(battle.artistB)}
              onVote={() => handleVote(battle.artistB)}
              hasVoted={hasVoted}
              battleStatus={battle.status}
              trackUrl={battle.tracks[battle.artistB]}
              isArtistRole={true}
              isCurrentUserArtist={isArtist}
              isCameraOn={isCameraOn}
              isMicOn={isMicOn}
              toggleMic={toggleMic}
              toggleCamera={toggleCamera}
              onJoin={!battle.artistB && !isArtist && !isJudge && !isSpectator ? () => handleJoinRole('artistB') : null}
            />
            <ParticipantBox 
              profile={profiles[battle.judge1 || '']}
              role="Judge 1"
              isLocal={profile?.uid === battle.judge1}
              stream={profile?.uid === battle.judge1 ? localStream : (battle.judge1 ? remoteStreams[battle.judge1] : null)}
              participantData={battle.judge1 ? remoteParticipants[battle.judge1] : null}
              isActive={false}
              hasVoted={hasVoted}
              battleStatus={battle.status}
              isArtistRole={false}
              isCurrentUserArtist={isArtist}
              isCameraOn={isCameraOn}
              isMicOn={isMicOn}
              toggleMic={toggleMic}
              toggleCamera={toggleCamera}
              onJoin={!battle.judge1 && !isArtist && !isJudge && !isSpectator ? () => handleJoinRole('judge1') : null}
            />
            <ParticipantBox 
              profile={profiles[battle.judge2 || '']}
              role="Judge 2"
              isLocal={profile?.uid === battle.judge2}
              stream={profile?.uid === battle.judge2 ? localStream : (battle.judge2 ? remoteStreams[battle.judge2] : null)}
              participantData={battle.judge2 ? remoteParticipants[battle.judge2] : null}
              isActive={false}
              hasVoted={hasVoted}
              battleStatus={battle.status}
              isArtistRole={false}
              isCurrentUserArtist={isArtist}
              isCameraOn={isCameraOn}
              isMicOn={isMicOn}
              toggleMic={toggleMic}
              toggleCamera={toggleCamera}
              onJoin={!battle.judge2 && !isArtist && !isJudge && !isSpectator ? () => handleJoinRole('judge2') : null}
            />
          </div>
        </div>

        {/* Right Section: Chat */}
        <div className="w-full lg:w-[400px] xl:w-[460px] flex flex-col min-h-[400px] lg:min-h-0 glass-panel rounded-2xl md:rounded-[3rem] border border-white/5 overflow-hidden neo-shadow bg-black/40 backdrop-blur-2xl">
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-white/5">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.8)]" />
              <span className="text-xs font-black uppercase tracking-[0.3em] text-white">Live Chat</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full">
              <Users className="w-3 h-3 text-red-600" />
              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">12 Online</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            {messages.map((msg, i) => (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                key={i} 
                className="flex items-start gap-4"
              >
                <div className="w-10 h-10 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center shrink-0 overflow-hidden shadow-lg">
                   {msg.senderPhoto ? (
                     <img src={msg.senderPhoto} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                   ) : (
                     <span className="text-xs font-black text-zinc-700">{msg.senderName?.[0]}</span>
                   )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="bg-white/5 hover:bg-white/10 transition-colors px-4 py-3 rounded-2xl rounded-tl-none border border-white/5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[9px] font-black text-red-600 uppercase tracking-widest truncate">{msg.senderName}</span>
                      <span className="text-[7px] font-bold text-zinc-600 uppercase">{format(msg.timestamp, 'HH:mm')}</span>
                    </div>
                    <p className="text-xs font-medium text-zinc-300 leading-relaxed break-words">
                      {msg.text}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <form onSubmit={handleSendMessage} className="p-4 bg-black/60 border-t border-white/5 flex gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="TYPE A MESSAGE..."
                className="w-full bg-white/5 border-none rounded-2xl px-6 py-4 text-xs font-black uppercase tracking-widest focus:ring-2 focus:ring-red-600/50 placeholder:text-zinc-700 text-white"
              />
            </div>
            <button type="submit" className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center hover:bg-red-500 transition-all shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:scale-105 active:scale-95 shrink-0">
              <Send className="w-6 h-6 text-white" />
            </button>
          </form>
        </div>
      </div>

        {/* Artist Controls Overlay (Floating) - REMOVED */}
      </div>
    );
  }

const ParticipantBox = ({ 
  profile: p, 
  role, 
  isLocal, 
  stream, 
  participantData,
  isActive,
  onTogglePlayback,
  onVote,
  hasVoted,
  battleStatus,
  trackUrl,
  isArtistRole,
  isCurrentUserArtist,
  isCameraOn,
  isMicOn,
  toggleMic,
  toggleCamera,
  onJoin
}: any) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const cameraOn = isLocal ? isCameraOn : participantData?.isCameraOn;
  const micOn = isLocal ? isMicOn : participantData?.isMicOn;

  // Ensure video is visible if camera is on
  useEffect(() => {
    if (videoRef.current && stream && cameraOn) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, cameraOn]);

  if (!p) {
    return (
      <div className="relative rounded-2xl md:rounded-[2.5rem] border-2 border-dashed border-white/10 overflow-hidden bg-zinc-900/20 aspect-[4/5] md:aspect-auto flex flex-col items-center justify-center gap-4 group hover:border-red-600/30 transition-all">
        <div className="w-16 h-16 md:w-24 md:h-24 rounded-full bg-zinc-900/50 border border-white/5 flex items-center justify-center text-zinc-700 group-hover:text-red-600/50 transition-colors">
          <Users className="w-8 h-8 md:w-12 md:h-12" />
        </div>
        <div className="text-center">
          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-500 text-[7px] font-black uppercase tracking-widest mb-2 inline-block">
            {role}
          </span>
          <h3 className="text-sm md:text-lg font-black uppercase tracking-tighter italic text-zinc-600">
            Slot Available
          </h3>
        </div>
        {onJoin && (
          <button 
            onClick={onJoin}
            className="px-6 py-2 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/20 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all"
          >
            Join as {role}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "relative rounded-2xl md:rounded-[2.5rem] border-2 overflow-hidden group transition-all duration-500 neo-shadow bg-zinc-900/40 aspect-[4/5]",
      isActive ? "border-red-600 shadow-[0_0_40px_rgba(220,38,38,0.4)] scale-[1.02] z-30" : "border-white/5"
    )}>
      {/* Live Badge */}
      {cameraOn && (
        <div className="absolute top-3 left-3 z-40 flex items-center gap-1.5 px-2 py-1 bg-red-600 rounded-full shadow-lg">
          <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          <span className="text-[8px] font-black uppercase tracking-widest text-white">Live</span>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent z-10" />
      
      {/* Video/Photo Layer */}
      <div className={cn(
        "absolute inset-0 z-20 flex items-center justify-center bg-zinc-950 transition-opacity duration-700",
        cameraOn ? "opacity-0 pointer-events-none" : "opacity-100"
      )}>
        <div className="relative">
          <div className="absolute -inset-4 bg-red-600/20 blur-2xl rounded-full animate-pulse" />
          {p?.photoURL ? (
            <img 
              src={`${p.photoURL}${p.photoURL.includes('?') ? '&' : '?'}t=${Date.now()}`} 
              className="relative w-20 h-20 md:w-32 md:h-32 rounded-full border-4 border-white/5 object-cover neo-shadow" 
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="relative w-20 h-20 md:w-32 md:h-32 rounded-full bg-zinc-900 flex items-center justify-center border-4 border-white/5">
              <Users className="w-8 h-8 md:w-12 md:h-12 text-zinc-800" />
            </div>
          )}
        </div>
      </div>

      {stream && (
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          muted={isLocal}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-transform duration-700",
            isActive && "scale-110"
          )} 
        />
      )}

      {/* Info Overlay */}
      <div className="absolute bottom-0 left-0 w-full p-4 md:p-8 z-20 space-y-2 md:space-y-4">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                "px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest",
                isArtistRole ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
              )}>
                {role}
              </span>
            </div>
            <h3 className="text-base md:text-2xl font-black uppercase tracking-tighter italic leading-none truncate text-white drop-shadow-lg">
              {p?.username || 'Waiting...'}
            </h3>
          </div>
          
          {trackUrl && (
            <button 
              onClick={onTogglePlayback}
              className="w-10 h-10 md:w-14 md:h-14 bg-red-600 rounded-xl md:rounded-2xl flex items-center justify-center hover:bg-red-500 transition-all shadow-xl hover:scale-110 active:scale-95 shrink-0"
            >
              {isActive ? <Pause className="w-4 h-4 md:w-6 md:h-6 text-white" fill="white" /> : <Play className="w-4 h-4 md:w-6 md:h-6 text-white" fill="white" />}
            </button>
          )}
        </div>

        {battleStatus === 'voting' && isArtistRole && !isCurrentUserArtist && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onVote}
            disabled={!!hasVoted}
            className={cn(
              "w-full py-2.5 md:py-4 rounded-xl md:rounded-2xl text-[9px] md:text-xs font-black uppercase tracking-[0.2em] transition-all shadow-xl",
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
      <div className="absolute top-3 right-3 z-30 flex flex-col gap-2">
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
            <button 
              onClick={toggleCamera}
              className={cn(
                "p-2 rounded-xl backdrop-blur-xl border transition-all",
                isCameraOn ? "bg-red-600 border-red-600/30 text-white" : "bg-black/60 border-white/5 text-zinc-600"
              )}
            >
              {isCameraOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
            </button>
          </div>
        ) : (
          <div className={cn(
            "p-2 rounded-xl backdrop-blur-xl border transition-all",
            micOn ? "bg-red-600/20 border-red-600/30 text-red-500" : "bg-black/60 border-white/5 text-zinc-600"
          )}>
            {micOn ? <Mic2 className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          </div>
        )}
      </div>
    </div>
  );
};
