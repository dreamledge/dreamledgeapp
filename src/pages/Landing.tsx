import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { motion } from 'motion/react';
import { Sword, Mic2, Users, Trophy, ChevronRight, Play, Shield, Zap } from 'lucide-react';

export default function Landing() {
  const handleSignIn = () => {
    signInWithPopup(auth, googleProvider);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-red-600 selection:text-white overflow-x-hidden relative font-sans">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1504333638930-c8787321eee0?auto=format&fit=crop&w=1920&q=80" 
            className="w-full h-full object-cover opacity-40 mix-blend-luminosity"
            alt="Mountain Ledge Moon"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/60 via-[#050505]/20 to-[#050505]" />
        </div>
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-900/10 blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-red-900/10 blur-[150px] rounded-full animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] pointer-events-none" />
        
        {/* Floating Dimensional Elements */}
        <motion.div 
          animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[20%] right-[15%] w-64 h-64 bg-red-600/5 border border-white/5 rounded-[3rem] backdrop-blur-3xl -rotate-12 hidden lg:block shadow-2xl"
        />
        <motion.div 
          animate={{ y: [0, 20, 0], rotate: [0, -5, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-[20%] left-[10%] w-48 h-48 bg-zinc-900/20 border border-white/5 rounded-[2rem] backdrop-blur-2xl rotate-12 hidden lg:block shadow-2xl"
        />
      </div>

      {/* Navbar */}
      <nav className="fixed top-0 left-0 w-full z-50 border-b border-white/5 bg-black/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.3)] group-hover:scale-110 transition-transform duration-300">
              <Sword className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tighter uppercase italic leading-none">Dreamledge</span>
              <span className="text-[8px] uppercase tracking-[0.4em] text-red-600 font-black">Arena Protocol</span>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-10 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">
            <a href="#features" className="hover:text-white transition-colors relative group">
              Features
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-red-600 transition-all group-hover:w-full"></span>
            </a>
            <a href="#arena" className="hover:text-white transition-colors relative group">
              Arena
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-red-600 transition-all group-hover:w-full"></span>
            </a>
            <a href="#leaderboard" className="hover:text-white transition-colors relative group">
              Leaderboard
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-red-600 transition-all group-hover:w-full"></span>
            </a>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">System Live</span>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-48 pb-32 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-12 relative"
        >
          {/* Auth Buttons Below Navbar */}
          <div className="flex items-center justify-center gap-6 mb-8">
            <button 
              onClick={handleSignIn}
              className="px-10 py-4 bg-zinc-900/50 border border-white/10 text-[11px] font-black uppercase tracking-[0.3em] rounded-2xl hover:bg-zinc-800 transition-all backdrop-blur-md"
            >
              Sign In
            </button>
            <button 
              onClick={handleSignIn}
              className="px-10 py-4 bg-white text-black text-[11px] font-black uppercase tracking-[0.3em] rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-xl"
            >
              Create Account
            </button>
          </div>

          {/* Hero Badge */}
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-zinc-900/50 border border-white/10 text-zinc-400 text-[10px] font-black uppercase tracking-[0.3em] mb-4 backdrop-blur-md shadow-2xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            System Status: Online &bull; v2.4.0
          </div>
          
          <div className="relative">
            {/* Background Glow for Text */}
            <div className="absolute -inset-20 bg-red-600/5 blur-[120px] rounded-full pointer-events-none"></div>
            
            <h1 className="text-8xl md:text-[12rem] font-black tracking-tighter leading-[0.8] uppercase italic relative">
              <span className="block text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-600">BATTLE</span>
              <span className="block text-red-600 drop-shadow-[0_20px_50px_rgba(220,38,38,0.4)]">BEYOND</span>
            </h1>
          </div>
          
          <p className="text-xl md:text-2xl text-zinc-400 max-w-3xl mx-auto font-medium leading-relaxed uppercase tracking-tight">
            The ultimate live music battle arena. Compete in high-stakes lyrical combat, judge the rising stars, and rise to the top of the ledge.
          </p>

          <div className="flex flex-col sm:flex-row gap-8 justify-center items-center pt-8">
            <motion.button
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSignIn}
              className="group relative px-16 py-8 bg-red-600 text-white font-black text-2xl uppercase tracking-[0.1em] transition-all overflow-hidden rounded-[2rem] shadow-[0_30px_60px_rgba(220,38,38,0.4)] hover:shadow-[0_40px_80px_rgba(220,38,38,0.5)]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
              <span className="relative flex items-center gap-4 italic">
                Enter Arena <ChevronRight className="w-8 h-8 group-hover:translate-x-2 transition-transform" />
              </span>
            </motion.button>

            <button
              onClick={handleSignIn}
              className="group flex items-center gap-4 px-10 py-6 rounded-[2rem] border border-white/10 bg-white/5 backdrop-blur-xl hover:bg-white/10 transition-all text-lg font-black uppercase tracking-widest italic"
            >
              <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-red-600 transition-colors">
                <Play className="w-5 h-5 fill-current" />
              </div>
              Watch Battles
            </button>
          </div>
        </motion.div>

        {/* Stats Section */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-32 grid grid-cols-2 md:grid-cols-4 gap-12 w-full max-w-5xl"
        >
          {[
            { label: "Active Battles", value: "1.2K+" },
            { label: "Artists Joined", value: "45K+" },
            { label: "Total Votes", value: "2.8M+" },
            { label: "Prize Pool", value: "$150K" }
          ].map((stat, i) => (
            <div key={i} className="text-center space-y-2">
              <div className="text-4xl font-black italic tracking-tighter text-white">{stat.value}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Dimensional Feature Grid */}
        <div className="mt-48 grid grid-cols-1 md:grid-cols-3 gap-10 w-full" id="features">
          {[
            { icon: Sword, title: "Music Battles", desc: "1v1 high-stakes lyrical combat with real-time audio sync and low-latency streaming.", accent: "red" },
            { icon: Zap, title: "Live Judging", desc: "Expert feedback and scoring from the arena's elite judges and rising stars.", accent: "orange" },
            { icon: Users, title: "Crowd Voting", desc: "The audience decides the fate of every battle with real-time interactive polls.", accent: "blue" },
            { icon: Trophy, title: "Leaderboards", desc: "Climb the ranks and earn your place in the Hall of Legends with seasonal rewards.", accent: "yellow" },
            { icon: Shield, title: "Artist Protection", desc: "Advanced copyright and identity protection for all original compositions.", accent: "green" },
            { icon: Mic2, title: "Studio Quality", desc: "Built-in audio processing and enhancement for professional-grade battle recordings.", accent: "purple" }
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="relative p-12 bg-zinc-900/40 border border-white/5 rounded-[3rem] hover:border-red-600/50 transition-all duration-500 group overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.4)] hover:shadow-[0_30px_70px_rgba(220,38,38,0.15)] hover:-translate-y-3 backdrop-blur-sm"
            >
              {/* Glass Reflection */}
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              
              <div className="w-20 h-20 bg-zinc-800 rounded-[1.5rem] flex items-center justify-center mb-10 group-hover:bg-red-600 group-hover:rotate-12 transition-all duration-500 shadow-2xl relative z-10">
                <feature.icon className="w-10 h-10 text-red-600 group-hover:text-white transition-colors" />
              </div>
              
              <h3 className="text-3xl font-black mb-6 uppercase tracking-tighter italic text-white relative z-10">{feature.title}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed font-bold uppercase tracking-tight opacity-80 relative z-10">{feature.desc}</p>
              
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-red-600/5 blur-3xl rounded-full group-hover:bg-red-600/10 transition-colors" />
            </motion.div>
          ))}
        </div>
      </main>

      <footer className="py-24 border-t border-white/5 bg-black/80 backdrop-blur-3xl relative z-10">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-16">
          <div className="col-span-2 space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.3)]">
                <Sword className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-3xl font-black uppercase italic tracking-tighter">Dreamledge</span>
                <span className="text-[10px] uppercase tracking-[0.4em] text-red-600 font-black">Arena Protocol</span>
              </div>
            </div>
            <p className="text-zinc-500 text-sm font-bold uppercase tracking-tight max-w-md leading-relaxed">
              The world's first decentralized music battle platform. Built for artists, judged by the community, powered by the arena protocol.
            </p>
          </div>
          
          <div className="space-y-6">
            <h4 className="text-white font-black uppercase tracking-widest text-xs">Platform</h4>
            <ul className="space-y-4 text-zinc-500 text-[11px] font-black uppercase tracking-[0.2em]">
              <li><a href="#" className="hover:text-red-500 transition-colors">Arena Lobby</a></li>
              <li><a href="#" className="hover:text-red-500 transition-colors">Leaderboard</a></li>
              <li><a href="#" className="hover:text-red-500 transition-colors">Hall of Legends</a></li>
              <li><a href="#" className="hover:text-red-500 transition-colors">Battle Rules</a></li>
            </ul>
          </div>

          <div className="space-y-6">
            <h4 className="text-white font-black uppercase tracking-widest text-xs">Legal</h4>
            <ul className="space-y-4 text-zinc-500 text-[11px] font-black uppercase tracking-[0.2em]">
              <li><a href="#" className="hover:text-red-500 transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-red-500 transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-red-500 transition-colors">Cookie Policy</a></li>
              <li><a href="#" className="hover:text-red-500 transition-colors">Contact Us</a></li>
            </ul>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-6 mt-24 pt-12 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-zinc-600 text-[10px] uppercase tracking-[0.4em] font-black">
            &copy; 2026 Dreamledge &bull; All Systems Operational &bull; Secure Transmission
          </div>
          <div className="flex gap-8">
            {['Twitter', 'Discord', 'Instagram', 'YouTube'].map((social) => (
              <a key={social} href="#" className="text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-[0.2em] transition-colors">
                {social}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
