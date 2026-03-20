import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Arena from './pages/Arena';
import ArenaLobby from './pages/ArenaLobby';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import Messages from './pages/Messages';
import Layout from './components/Layout';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse text-red-600 font-bold text-2xl tracking-tighter">
          LOADING ARENA...
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={!user ? <Landing /> : <Navigate to="/dashboard" />} />
        
        <Route element={<Layout />}>
          <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/" />} />
          <Route path="/arena/lobby" element={user ? <ArenaLobby /> : <Navigate to="/" />} />
          <Route path="/arena/:battleId" element={user ? <Arena /> : <Navigate to="/" />} />
          <Route path="/profile/:uid" element={user ? <Profile /> : <Navigate to="/" />} />
          <Route path="/leaderboard" element={user ? <Leaderboard /> : <Navigate to="/" />} />
          <Route path="/messages" element={user ? <Messages /> : <Navigate to="/" />} />
        </Route>
      </Routes>
    </Router>
  );
}
