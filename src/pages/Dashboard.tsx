import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Sword, Trophy, Users, Mic2, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const stats = [
    { label: 'Wins', value: profile?.stats.wins || 0, icon: Trophy, color: 'text-emerald-500' },
    { label: 'Losses', value: profile?.stats.losses || 0, icon: Sword, color: 'text-red-500' },
    { label: 'ELO', value: profile?.stats.ranking || 0, icon: Users, color: 'text-blue-500' },
  ];

  return (
    <div className="relative min-h-screen pb-20">
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-900/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-zinc-900/20 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 space-y-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-2"
          >
            <h2 className="text-5xl font-black uppercase tracking-tighter italic bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
              Welcome Back
            </h2>
            <p className="text-zinc-400 font-medium tracking-wide">Ready to claim your throne in the arena?</p>
          </motion.div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {stats.map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="glass-panel p-8 rounded-3xl border border-zinc-800/50 neo-shadow flex flex-col items-center text-center group"
            >
              <div className={`p-4 rounded-2xl bg-zinc-900/50 mb-4 group-hover:scale-110 transition-transform ${stat.color}`}>
                <stat.icon className="w-8 h-8" />
              </div>
              <div className="text-4xl font-black mb-1">{stat.value}</div>
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="relative overflow-hidden rounded-3xl border border-red-600/30 bg-red-950/10 p-12 text-center neo-shadow"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-red-600/5 to-transparent pointer-events-none" />
          <div className="relative z-10 space-y-6">
            <h3 className="text-4xl font-black uppercase tracking-tighter italic">Enter the Arena</h3>
            <p className="text-zinc-400 max-w-xl mx-auto font-medium">
              Join live battles, judge the talent, or watch the world's best lyricists compete for glory.
            </p>
            <button
              onClick={() => navigate('/arena/lobby')}
              className="group relative inline-flex items-center gap-3 px-10 py-5 bg-red-600 hover:bg-red-500 text-white font-black uppercase text-sm tracking-[0.2em] transition-all rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(220,38,38,0.4)]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              Go to Arena Lobby
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.div>

        {/* Recent Activity / Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-panel p-8 rounded-3xl border border-zinc-800/50 neo-shadow"
          >
            <h4 className="text-xl font-black uppercase tracking-tight mb-6 flex items-center gap-3">
              <Mic2 className="w-5 h-5 text-red-600" />
              Quick Actions
            </h4>
            <div className="space-y-4">
              <button 
                onClick={() => navigate('/leaderboard')}
                className="w-full p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-600/50 transition-all text-left flex items-center justify-between group"
              >
                <span className="font-bold uppercase tracking-wider text-sm">View Leaderboard</span>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all" />
              </button>
              <button 
                onClick={() => navigate('/messages')}
                className="w-full p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-600/50 transition-all text-left flex items-center justify-between group"
              >
                <span className="font-bold uppercase tracking-wider text-sm">Check Messages</span>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all" />
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
            className="glass-panel p-8 rounded-3xl border border-zinc-800/50 neo-shadow"
          >
            <h4 className="text-xl font-black uppercase tracking-tight mb-6 flex items-center gap-3">
              <Users className="w-5 h-5 text-red-600" />
              Community
            </h4>
            <div className="p-6 rounded-2xl bg-zinc-900/30 border border-dashed border-zinc-800 text-center space-y-2">
              <p className="text-zinc-500 text-sm font-medium">New features coming soon!</p>
              <p className="text-zinc-600 text-xs">Clans, tournaments, and more.</p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
