import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Sword, Mic2, Users, Plus, Loader2, Video, VideoOff, MicOff } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, deleteDoc, doc, setDoc, limit, getDocs } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export default function ArenaLobby() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [isSearching, setIsSearching] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [micEnabled, setMicEnabled] = useState(() => localStorage.getItem('micEnabled') !== 'false');
  const [cameraEnabled, setCameraEnabled] = useState(() => localStorage.getItem('cameraEnabled') === 'true');

  useEffect(() => {
    localStorage.setItem('micEnabled', String(micEnabled));
    localStorage.setItem('cameraEnabled', String(cameraEnabled));
  }, [micEnabled, cameraEnabled]);

  useEffect(() => {
    if (!isSearching || !profile) return;

    const findMatch = async () => {
      if (!profile) return;

      // Try to find an existing battle that needs participants
      const q = query(
        collection(db, 'battles'),
        where('status', '==', 'waiting'),
        where('isCustom', '==', false),
        limit(10)
      );
      const snapshot = await getDocs(q);
      
      let targetBattleId = null;
      let roleToFill = null;

      if (isSearching === 'artist') {
        localStorage.setItem('arenaRole', 'artist');
        // Find a battle where Artist A or Artist B is missing
        const available = snapshot.docs.find(d => !d.data().artistA || !d.data().artistB);
        if (available) {
          targetBattleId = available.id;
          roleToFill = !available.data().artistA ? 'artistA' : 'artistB';
        }
      } else if (isSearching === 'judge') {
        localStorage.setItem('arenaRole', 'judge');
        // Find a battle where Judge 1 or Judge 2 is missing
        const available = snapshot.docs.find(d => !d.data().judge1 || !d.data().judge2);
        if (available) {
          targetBattleId = available.id;
          roleToFill = !available.data().judge1 ? 'judge1' : 'judge2';
        }
      }

      if (targetBattleId && roleToFill) {
        const battleDoc = snapshot.docs.find(d => d.id === targetBattleId);
        if (battleDoc) {
          const data = battleDoc.data();
          const updateData: any = { [roleToFill]: profile.uid };
          
          // CRITICAL: Remove from other roles in the SAME battle to prevent duplicates
          if (data.artistA === profile.uid && roleToFill !== 'artistA') updateData.artistA = null;
          if (data.artistB === profile.uid && roleToFill !== 'artistB') updateData.artistB = null;
          if (data.judge1 === profile.uid && roleToFill !== 'judge1') updateData.judge1 = null;
          if (data.judge2 === profile.uid && roleToFill !== 'judge2') updateData.judge2 = null;

          const roles = {
            artistA: data.artistA,
            artistB: data.artistB,
            judge1: data.judge1,
            judge2: data.judge2,
            ...updateData
          };
          
          if (roles.artistA && roles.artistB && roles.judge1 && roles.judge2) {
            updateData.status = 'selection';
            updateData.phase = 'selection';
            updateData.phaseStartTime = Date.now();
          }

          await setDoc(doc(db, 'battles', targetBattleId), updateData, { merge: true });
          navigate(`/arena/${targetBattleId}`);
        }
      } else if (isSearching === 'artist') {
        localStorage.setItem('arenaRole', 'artist');
        // Create new waiting battle if no available slot for artist
        const battleRef = await addDoc(collection(db, 'battles'), {
          status: 'waiting',
          artistA: profile.uid,
          artistB: null,
          judge1: null,
          judge2: null,
          phase: 'waiting',
          phaseStartTime: Date.now(),
          tracks: {},
          votes: {},
          isCustom: false,
          createdAt: Date.now()
        });
        navigate(`/arena/${battleRef.id}`);
      } else if (isSearching === 'spectator') {
        localStorage.setItem('arenaRole', 'spectator');
        const qSpec = query(
          collection(db, 'battles'),
          where('status', 'in', ['waiting', 'selection', 'active']),
          limit(1)
        );
        const specSnapshot = await getDocs(qSpec);
        if (!specSnapshot.empty) {
          navigate(`/arena/${specSnapshot.docs[0].id}`);
        }
      }
    };

    findMatch();
  }, [isSearching, profile, navigate]);

  // Listen for battles where I am artistB
  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, 'battles'), where('artistB', '==', profile.uid), where('status', '==', 'selection'), limit(1));
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        navigate(`/arena/${snapshot.docs[0].id}`);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'battles');
    });
    return () => unsub();
  }, [profile, navigate]);

  const handleCreateRoom = async () => {
    const code = roomCode || Math.random().toString(36).substring(2, 8).toUpperCase();
    const battleRef = await addDoc(collection(db, 'battles'), {
      status: 'waiting',
      artistA: profile?.uid,
      artistB: null,
      judge1: null,
      judge2: null,
      phase: 'waiting',
      phaseStartTime: Date.now(),
      tracks: {},
      votes: {},
      isCustom: true,
      roomCode: code,
      createdAt: Date.now()
    });
    navigate(`/arena/${battleRef.id}`);
  };

  const menuItems = [
    { id: 'artist', label: 'Random Artist Battle', icon: Sword, color: 'bg-red-600', desc: '1v1 lyrical combat' },
    { id: 'judge', label: 'Random Judge', icon: Mic2, color: 'bg-zinc-800', desc: 'Evaluate the talent' },
    { id: 'spectator', label: 'Random Spectator', icon: Users, color: 'bg-zinc-900', desc: 'Watch the action' },
  ];

  return (
    <div className="relative min-h-screen pb-20">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-900/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-zinc-900/20 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 space-y-8 md:space-y-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-1 md:space-y-2 text-center md:text-left"
          >
            <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter italic bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
              The Arena
            </h2>
            <p className="text-zinc-500 font-bold tracking-widest text-[10px] md:text-sm uppercase">Choose your path and prove your worth.</p>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col sm:flex-row items-center gap-2 md:gap-4 glass-panel p-1.5 md:p-2 rounded-xl md:rounded-2xl neo-shadow w-full md:w-auto"
          >
            <div className="relative flex items-center w-full sm:w-auto">
              <input
                type="text"
                placeholder="ROOM CODE"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                className="bg-transparent border-none focus:ring-0 text-[10px] md:text-sm font-black uppercase tracking-[0.3em] px-4 md:px-6 py-3 md:py-4 w-full sm:w-56 placeholder:text-zinc-700"
              />
            </div>
            <button
              onClick={handleCreateRoom}
              className="group relative flex items-center justify-center gap-2 md:gap-3 px-6 md:px-8 py-3 md:py-4 bg-red-600 hover:bg-red-500 text-white font-black uppercase text-[10px] md:text-xs tracking-[0.2em] transition-all rounded-lg md:rounded-xl overflow-hidden shadow-[0_0_20px_rgba(220,38,38,0.3)] w-full sm:w-auto"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              <Plus className="w-3 h-3 md:w-4 md:h-4" />
              Create Room
            </button>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
          {menuItems.map((item, i) => (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => setIsSearching(item.id)}
              disabled={isSearching !== null}
              className={cn(
                "group relative p-6 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-white/5 transition-all duration-500 overflow-hidden text-left neo-shadow",
                isSearching === item.id ? "bg-red-600 border-red-500 scale-95" : "bg-zinc-900/40 hover:bg-zinc-800/60 hover:border-red-600/50 hover:-translate-y-2"
              )}
            >
              <div className="absolute top-0 right-0 p-4 md:p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <item.icon className="w-20 h-20 md:w-32 md:h-32 rotate-12" />
              </div>
              
              <div className={cn(
                "w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl flex items-center justify-center mb-6 md:mb-8 transition-colors",
                isSearching === item.id ? "bg-white/20" : item.color
              )}>
                {isSearching === item.id ? (
                  <Loader2 className="w-6 h-6 md:w-8 md:h-8 text-white animate-spin" />
                ) : (
                  <item.icon className="w-6 h-6 md:w-8 md:h-8 text-white" />
                )}
              </div>

              <div className="space-y-1 md:space-y-2">
                <h3 className="text-xl md:text-2xl font-black uppercase tracking-tighter italic text-white">
                  {isSearching === item.id ? 'Searching...' : item.label}
                </h3>
                <p className="text-zinc-500 text-[10px] md:text-xs font-bold uppercase tracking-widest group-hover:text-zinc-400">
                  {item.desc}
                </p>
              </div>

              {isSearching === item.id && (
                <div className="mt-8 flex items-center gap-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(dot => (
                      <motion.div
                        key={dot}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: dot * 0.2 }}
                        className="w-1.5 h-1.5 bg-white rounded-full"
                      />
                    ))}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/60">
                    Finding Opponents
                  </span>
                </div>
              )}
            </motion.button>
          ))}
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-white/5 neo-shadow max-w-2xl mx-auto"
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8">
            <div className="space-y-1 md:space-y-2 text-center md:text-left">
              <h3 className="text-lg md:text-xl font-black uppercase tracking-tighter italic text-white">Media Settings</h3>
              <p className="text-zinc-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest">Configure your gear before joining</p>
            </div>
            <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto">
              <button 
                onClick={() => setMicEnabled(!micEnabled)}
                className={cn(
                  "flex-1 md:flex-none flex items-center justify-center gap-3 md:gap-4 px-4 md:px-6 py-3 rounded-xl md:rounded-2xl transition-all border",
                  micEnabled ? "bg-red-600/10 border-red-600/20 text-red-500" : "bg-zinc-900 border-white/5 text-zinc-500"
                )}
              >
                {micEnabled ? <Mic2 className="w-4 h-4 md:w-5 md:h-5" /> : <MicOff className="w-4 h-4 md:w-5 md:h-5" />}
                <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest">{micEnabled ? 'Mic On' : 'Mic Off'}</span>
              </button>
              <button 
                onClick={() => setCameraEnabled(!cameraEnabled)}
                className={cn(
                  "flex-1 md:flex-none flex items-center justify-center gap-3 md:gap-4 px-4 md:px-6 py-3 rounded-xl md:rounded-2xl transition-all border",
                  cameraEnabled ? "bg-red-600/10 border-red-600/20 text-red-500" : "bg-zinc-900 border-white/5 text-zinc-500"
                )}
              >
                {cameraEnabled ? <Video className="w-4 h-4 md:w-5 md:h-5" /> : <VideoOff className="w-4 h-4 md:w-5 md:h-5" />}
                <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest">{cameraEnabled ? 'Camera On' : 'Camera Off'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
