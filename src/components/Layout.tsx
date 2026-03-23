import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, Sword, Trophy, MessageSquare, User, LogOut } from 'lucide-react';
import { auth } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export default function Layout() {
  const { profile } = useAuth();
  const location = useLocation();

  const navItems = [
    { icon: Home, label: 'Home', path: '/dashboard' },
    { icon: Sword, label: 'Arena', path: '/arena/lobby' },
    { icon: Trophy, label: 'Leaderboard', path: '/leaderboard' },
    { icon: MessageSquare, label: 'Messages', path: '/messages' },
    { icon: User, label: 'Profile', path: `/profile/${profile?.uid}` },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans">
      {/* App Header */}
      <header className="bg-black/50 backdrop-blur-xl border-b border-white/5 py-4 px-6 flex items-center justify-between sticky top-0 z-50 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.3)] group-hover:scale-110 transition-transform duration-300">
            <Sword className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-black tracking-tighter text-white uppercase italic leading-none">
              Dreamledge
            </span>
            <span className="text-[9px] uppercase tracking-[0.3em] text-red-600 font-black">
              Arena Protocol
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-black uppercase tracking-tight">{profile?.username}</span>
            <div className="flex items-center gap-2">
              <Trophy className="w-3 h-3 text-red-600" />
              <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">
                Rank #{profile?.stats.ranking}
              </span>
            </div>
          </div>
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-red-900 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <img
              src={profile?.photoURL ? `${profile.photoURL}${profile.photoURL.includes('?') ? '&' : '?'}t=${Date.now()}` : undefined}
              alt="Avatar"
              className="relative w-10 h-10 rounded-full border border-white/10 object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <button
            onClick={() => auth.signOut()}
            className="p-2.5 bg-zinc-900 hover:bg-red-600/20 rounded-xl transition-all text-zinc-500 hover:text-red-500 border border-white/5"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="bg-zinc-950/50 backdrop-blur-md border-b border-white/5 px-6 overflow-x-auto no-scrollbar sticky top-[73px] z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between md:justify-start gap-2 sm:gap-10">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "py-2 px-2 flex flex-col sm:flex-row items-center gap-1 sm:gap-2.5 transition-all relative group flex-1 sm:flex-none",
                location.pathname === item.path ? "text-red-600" : "text-zinc-500 hover:text-white"
              )}
            >
              <item.icon className={cn("w-5 h-5 sm:w-4 sm:h-4 transition-transform group-hover:scale-110", location.pathname === item.path && "text-red-600")} />
              <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.1em] sm:tracking-[0.2em]">{item.label}</span>
              {location.pathname === item.path && (
                <motion.div 
                  layoutId="nav-underline"
                  className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]" 
                />
              )}
            </Link>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className={cn(
        "flex-1",
        location.pathname.startsWith('/arena/') && location.pathname !== '/arena/lobby' ? "overflow-hidden" : "overflow-y-auto"
      )}>
        <div className={cn(
          "mx-auto h-full",
          location.pathname.startsWith('/arena/') && location.pathname !== '/arena/lobby' ? "p-0 max-w-none" : "p-6 max-w-7xl"
        )}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
