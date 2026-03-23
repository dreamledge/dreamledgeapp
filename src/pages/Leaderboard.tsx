import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../hooks/useAuth';
import { Trophy, Medal, Star, ArrowUp } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export default function Leaderboard() {
  const [leaders, setLeaders] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      orderBy('stats.ranking', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setLeaders(snapshot.docs.map(d => d.data() as UserProfile));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsub();
  }, []);

  return (
    <div className="relative max-w-5xl mx-auto space-y-12 pb-20">
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-5%] right-[-5%] w-[35%] h-[35%] bg-red-900/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[35%] h-[35%] bg-zinc-900/20 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 text-center space-y-4"
      >
        <div className="inline-flex items-center gap-3 px-6 py-2 glass-panel rounded-full border border-white/10 mb-4">
          <Trophy className="w-4 h-4 text-red-600" />
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400">Competitive Rankings</span>
        </div>
        <h2 className="text-7xl font-black uppercase tracking-tighter italic bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent leading-none">
          Hall of Legends
        </h2>
        <p className="text-zinc-500 font-medium uppercase tracking-[0.3em] text-[10px]">The elite artists of the arena sector</p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="relative z-10"
      >
        <div className="hidden sm:grid grid-cols-12 gap-6 p-8 bg-white/5 border border-zinc-800/50 rounded-t-[2.5rem] text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">
          <div className="col-span-1 text-center">Rank</div>
          <div className="col-span-6">Artist Profile</div>
          <div className="col-span-2 text-center">Victories</div>
          <div className="col-span-3 text-right">ELO Rating</div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-0 sm:block">
          {leaders.map((user, i) => (
            <Link
              key={user.uid}
              to={`/profile/${user.uid}`}
              className="flex flex-col sm:grid sm:grid-cols-12 gap-4 sm:gap-6 p-6 sm:p-8 items-center bg-zinc-900/50 sm:bg-transparent border border-zinc-800/50 sm:border-0 sm:border-b sm:border-zinc-800/30 rounded-3xl sm:rounded-none hover:bg-white/5 transition-all group relative overflow-hidden"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-red-600 scale-y-0 group-hover:scale-y-100 transition-transform origin-top duration-500" />
              
              <div className="flex sm:col-span-1 justify-between sm:justify-center items-center w-full sm:w-auto">
                <span className="sm:hidden text-[10px] font-black uppercase tracking-widest text-zinc-600">Rank</span>
                {i === 0 ? (
                  <div className="relative">
                    <div className="absolute inset-0 bg-yellow-500 blur-xl opacity-20 animate-pulse" />
                    <Trophy className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-500 relative z-10" />
                  </div>
                ) : i === 1 ? (
                  <Medal className="w-6 h-6 sm:w-8 sm:h-8 text-zinc-400" />
                ) : i === 2 ? (
                  <Medal className="w-6 h-6 sm:w-8 sm:h-8 text-amber-600" />
                ) : (
                  <span className="text-lg sm:text-xl font-black text-zinc-700 group-hover:text-red-600 transition-colors tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                )}
              </div>

              <div className="flex sm:col-span-6 items-center gap-4 sm:gap-6 w-full sm:w-auto">
                <div className="relative shrink-0">
                  <div className="absolute inset-0 bg-red-600 blur-xl opacity-0 group-hover:opacity-20 transition-opacity" />
                  <img 
                    src={user.photoURL} 
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl border-2 border-zinc-800 group-hover:border-red-600/50 transition-all object-cover relative z-10" 
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-lg sm:text-lg font-black uppercase tracking-tight group-hover:text-red-600 transition-colors leading-none mb-1 truncate">
                    {user.username}
                  </div>
                  <div className="text-[10px] sm:text-[10px] text-zinc-600 font-bold uppercase tracking-[0.2em] truncate max-w-full">
                    {user.bio || "No bio set"}
                  </div>
                </div>
              </div>

              <div className="flex sm:col-span-2 justify-between sm:justify-center items-center w-full sm:w-auto pt-4 sm:pt-0 border-t border-zinc-800/30 sm:border-0">
                <span className="sm:hidden text-[10px] font-black uppercase tracking-widest text-zinc-600">Victories</span>
                <span className="text-xl sm:text-2xl font-black text-zinc-400 group-hover:text-white transition-colors tabular-nums">
                  {user.stats.wins}
                </span>
              </div>

              <div className="flex sm:col-span-3 justify-between sm:justify-end items-center w-full sm:w-auto gap-4">
                <span className="sm:hidden text-[10px] font-black uppercase tracking-widest text-zinc-600">ELO Rating</span>
                <div className="text-right">
                  <span className="block text-2xl sm:text-3xl font-black italic leading-none group-hover:text-red-600 transition-colors tabular-nums">
                    {user.stats.ranking}
                  </span>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <ArrowUp className="w-3 h-3 text-green-500" />
                    <span className="text-[7px] sm:text-[8px] font-black text-green-500 uppercase tracking-widest">Trending</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
