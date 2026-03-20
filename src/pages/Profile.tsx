import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Edit2, Trophy, Sword, Users, Calendar, Camera, Loader2, Check } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { db, storage, auth } from '../firebase';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth, UserProfile } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export default function Profile() {
  const { uid } = useParams();
  const { profile: myProfile } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [bio, setBio] = useState('');
  const [username, setUsername] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const isOwnProfile = myProfile?.uid === uid;

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'users', uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as UserProfile;
        setProfile(data);
        setBio(data.bio);
        setUsername(data.username);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${uid}`);
    });
    return () => unsub();
  }, [uid]);

  const handleUpdateProfile = async () => {
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid), { 
      bio,
      username: username.trim() || profile?.username
    });
    setIsEditing(false);
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;

    setIsUploading(true);
    try {
      const fileRef = ref(storage, `avatars/${uid}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      await updateDoc(doc(db, 'users', uid), { photoURL: url });
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { photoURL: url });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectDefaultAvatar = async (url: string) => {
    if (!uid) return;
    setIsUploading(true);
    try {
      await updateDoc(doc(db, 'users', uid), { photoURL: url });
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { photoURL: url });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const defaultAvatars = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Jasper',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Lilly',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Oliver',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Maya'
  ];

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-red-600" /></div>;
  if (!profile) return <div className="text-center py-24 text-zinc-500 uppercase font-black tracking-widest">User not found</div>;

  return (
    <div className="relative max-w-5xl mx-auto space-y-12 pb-20">
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-900/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-zinc-900/20 blur-[120px] rounded-full" />
      </div>

      {/* Profile Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10"
      >
        <div className="h-64 bg-gradient-to-br from-red-950/40 via-zinc-900/40 to-black rounded-[3rem] border border-white/10 neo-shadow overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(220,38,38,0.1),transparent_70%)]" />
          <div className="absolute top-0 right-0 p-10 opacity-10">
            <Sword className="w-40 h-40 rotate-12" />
          </div>
        </div>
        
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 md:left-12 md:translate-x-0 flex flex-col md:flex-row items-center md:items-end gap-6 md:gap-10 w-full md:w-auto px-4 md:px-0">
          <div className="relative group">
            <div className="absolute inset-0 bg-red-600 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity" />
            <div className="relative">
              <img
                src={`${profile.photoURL}${profile.photoURL.includes('?') ? '&' : '?'}t=${Date.now()}`}
                alt={profile.username}
                className="w-32 h-32 md:w-44 md:h-44 rounded-[2rem] md:rounded-[2.5rem] border-4 border-[#050505] bg-zinc-900 object-cover shadow-2xl relative z-10"
                referrerPolicy="no-referrer"
              />
              {isOwnProfile && (
                <label className="absolute inset-0 bg-black/60 rounded-[2rem] md:rounded-[2.5rem] md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-opacity flex items-center justify-center cursor-pointer z-20 backdrop-blur-sm">
                  <Camera className="w-8 h-8 md:w-10 md:h-10 text-white" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleUploadPhoto} />
                </label>
              )}
              {isUploading && (
                <div className="absolute inset-0 bg-black/60 rounded-[2rem] md:rounded-[2.5rem] flex items-center justify-center z-30 backdrop-blur-md">
                  <Loader2 className="w-8 h-8 md:w-10 md:h-10 text-red-600 animate-spin" />
                </div>
              )}
            </div>
          </div>
          
          <div className="pb-0 md:pb-6 space-y-3 text-center md:text-left">
            <div className="flex flex-col md:flex-row items-center gap-4">
              {isEditing ? (
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="text-3xl md:text-6xl font-black uppercase tracking-tighter italic leading-none bg-zinc-900 border border-white/10 rounded-2xl px-4 py-2 text-white focus:ring-2 focus:ring-red-600/50 w-full md:w-auto text-center md:text-left"
                  placeholder="Username"
                />
              ) : (
                <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic leading-none bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
                  {profile.username}
                </h2>
              )}
              {isOwnProfile && (
                <button 
                  onClick={() => setIsEditing(!isEditing)}
                  className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all group/edit"
                >
                  <Edit2 className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-center md:justify-start gap-3">
              <div className="px-4 py-1.5 bg-red-600 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-white shadow-[0_0_20px_rgba(220,38,38,0.3)]">
                Rank #{profile.stats.ranking}
              </div>
              <div className="px-4 py-1.5 bg-zinc-800/50 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">
                Elite Artist
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-10 pt-16">
        {/* Stats */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="md:col-span-1 space-y-8"
        >
          <div className="glass-panel border border-zinc-800/50 rounded-[2.5rem] p-10 space-y-8 neo-shadow">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 flex items-center justify-center md:justify-start gap-3">
              <div className="w-1 h-4 bg-red-600 rounded-full" />
              Arena Performance
            </h3>
            
            <div className="space-y-8">
              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-red-600/10 rounded-2xl flex items-center justify-center border border-red-600/20 group-hover:bg-red-600/20 transition-colors">
                    <Trophy className="w-6 h-6 text-red-600" />
                  </div>
                  <div className="text-left">
                    <span className="block text-sm font-black uppercase tracking-tight text-white">Victories</span>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Total Wins</span>
                  </div>
                </div>
                <span className="text-3xl font-black italic tabular-nums">{profile.stats.wins}</span>
              </div>

              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-zinc-800/50 rounded-2xl flex items-center justify-center border border-white/5 group-hover:bg-zinc-800 transition-colors">
                    <Sword className="w-6 h-6 text-zinc-500" />
                  </div>
                  <div className="text-left">
                    <span className="block text-sm font-black uppercase tracking-tight text-white">Defeats</span>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Total Losses</span>
                  </div>
                </div>
                <span className="text-3xl font-black italic tabular-nums text-zinc-500">{profile.stats.losses}</span>
              </div>

              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/5 group-hover:bg-white/10 transition-colors">
                    <Users className="w-6 h-6 text-zinc-400" />
                  </div>
                  <div className="text-left">
                    <span className="block text-sm font-black uppercase tracking-tight text-white">Win Rate</span>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Efficiency</span>
                  </div>
                </div>
                <span className="text-3xl font-black italic tabular-nums">
                  {profile.stats.wins + profile.stats.losses > 0 
                    ? Math.round((profile.stats.wins / (profile.stats.wins + profile.stats.losses)) * 100) 
                    : 0}%
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bio & History */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="md:col-span-2 space-y-10"
        >
          <div className="glass-panel border border-zinc-800/50 rounded-[2.5rem] p-10 neo-shadow">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 mb-6 flex items-center justify-center md:justify-start gap-3">
              <div className="w-1 h-4 bg-red-600 rounded-full" />
              Artist Legend
            </h3>
            {isEditing ? (
              <div className="space-y-6">
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 mb-6">
                  {defaultAvatars.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectDefaultAvatar(url)}
                      className="relative group/avatar"
                    >
                      <img 
                        src={url} 
                        className={cn(
                          "w-full aspect-square rounded-xl border-2 transition-all",
                          profile.photoURL === url ? "border-red-600 scale-110 shadow-lg" : "border-white/5 hover:border-white/20"
                        )} 
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-[2rem] p-8 text-sm font-medium focus:ring-2 focus:ring-red-600/50 min-h-[180px] placeholder:text-zinc-700 leading-relaxed text-center md:text-left"
                  placeholder="Tell the arena your story..."
                />
                <div className="flex justify-center md:justify-end gap-4">
                  <button 
                    onClick={() => setIsEditing(false)} 
                    className="px-8 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleUpdateProfile} 
                    className="px-10 py-4 bg-red-600 hover:bg-red-500 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-3 shadow-[0_0_20px_rgba(220,38,38,0.3)] transition-all"
                  >
                    <Check className="w-4 h-4" /> Save Legend
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xl text-zinc-300 leading-relaxed font-medium italic bg-white/5 p-8 rounded-[2rem] border border-white/5 text-center md:text-left">
                "{profile.bio || "This artist hasn't written their legend yet."}"
              </p>
            )}
          </div>

          <div className="glass-panel border border-zinc-800/50 rounded-[2.5rem] p-10 neo-shadow">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 flex items-center gap-3">
                <div className="w-1 h-4 bg-red-600 rounded-full" />
                Battle History
              </h3>
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Last 10 Matches</div>
            </div>

            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="group relative bg-black/40 p-6 rounded-[2rem] border border-zinc-800/50 flex items-center justify-between hover:border-red-600/30 transition-all overflow-hidden">
                  <div className="absolute inset-y-0 left-0 w-1 bg-red-600 scale-y-0 group-hover:scale-y-100 transition-transform origin-top duration-500" />
                  
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-zinc-900 rounded-2xl flex items-center justify-center border border-white/5 group-hover:bg-red-600/10 transition-colors">
                      <Sword className="w-6 h-6 text-zinc-700 group-hover:text-red-600 transition-colors" />
                    </div>
                    <div>
                      <div className="text-lg font-black uppercase tracking-tight text-white leading-none mb-1">vs. Artist_{Math.floor(Math.random() * 1000)}</div>
                      <div className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        2 days ago
                      </div>
                    </div>
                  </div>
                  <div className={cn(
                    "px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg",
                    i === 1 ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-500"
                  )}>
                    {i === 1 ? "Victory" : "Defeat"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
