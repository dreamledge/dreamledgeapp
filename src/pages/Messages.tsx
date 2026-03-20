import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, doc, getDoc, limit, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth, UserProfile } from '../hooks/useAuth';
import { Send, Search, MessageSquare, Loader2, ChevronRight, User, Plus, Users, Hash, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface Chat {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastTimestamp?: any;
}

interface Room {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: any;
  lastMessage?: string;
  lastTimestamp?: any;
}

interface Message {
  id: string;
  senderId: string;
  senderName?: string;
  senderPhoto?: string;
  text: string;
  timestamp: any;
}

export default function Messages() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'dms' | 'rooms'>('dms');
  const [chats, setChats] = useState<Chat[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatProfiles, setChatProfiles] = useState<{ [uid: string]: UserProfile }>({});
  
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomSubject, setNewRoomSubject] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', profile.uid),
      orderBy('lastTimestamp', 'desc')
    );

    const unsub = onSnapshot(q, async (snapshot) => {
      const chatList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Chat));
      setChats(chatList);
      
      const uids = new Set<string>();
      chatList.forEach(c => c.participants.forEach(p => uids.add(p)));
      
      const newProfiles = { ...chatProfiles };
      for (const uid of uids) {
        if (!newProfiles[uid]) {
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists()) {
            newProfiles[uid] = userDoc.data() as UserProfile;
          }
        }
      }
      setChatProfiles(newProfiles);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chats');
    });

    return () => unsub();
  }, [profile]);

  // Fetch Rooms
  useEffect(() => {
    if (!profile) return;

    const q = query(
      collection(db, 'rooms'),
      orderBy('lastTimestamp', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setRooms(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Room)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rooms');
    });

    return () => unsub();
  }, [profile]);

  // Fetch Messages for active chat or room
  useEffect(() => {
    if (!activeChat && !activeRoom) {
      setMessages([]);
      return;
    }

    const path = activeChat 
      ? `chats/${activeChat.id}/messages` 
      : `rooms/${activeRoom!.id}/messages`;

    const q = query(
      collection(db, path),
      orderBy('timestamp', 'asc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsub();
  }, [activeChat, activeRoom]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Real-time search as user types
  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim() || !profile) {
        setSearchResults([]);
        return;
      }

      const q = query(
        collection(db, 'users'),
        where('username', '>=', searchQuery),
        where('username', '<=', searchQuery + '\uf8ff'),
        limit(5)
      );

      try {
        const snapshot = await getDocs(q);
        setSearchResults(snapshot.docs
          .map(d => d.data() as UserProfile)
          .filter(u => u.uid !== profile.uid)
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
    };

    const timeoutId = setTimeout(searchUsers, 300); // 300ms debounce
    return () => clearTimeout(timeoutId);
  }, [searchQuery, profile]);

  const startChat = async (otherUser: UserProfile) => {
    if (!profile) return;

    const existingChat = chats.find(c => c.participants.includes(otherUser.uid));
    if (existingChat) {
      setActiveChat(existingChat);
      setActiveRoom(null);
      setShowNewDM(false);
      setSearchQuery('');
      setSearchResults([]);
      return;
    }

    const chatRef = await addDoc(collection(db, 'chats'), {
      participants: [profile.uid, otherUser.uid],
      lastTimestamp: serverTimestamp()
    });

    setActiveChat({ id: chatRef.id, participants: [profile.uid, otherUser.uid] });
    setActiveRoom(null);
    setShowNewDM(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim() || !profile) return;

    const roomRef = await addDoc(collection(db, 'rooms'), {
      name: newRoomName,
      subject: newRoomSubject,
      description: newRoomDesc,
      createdBy: profile.uid,
      createdAt: serverTimestamp(),
      lastTimestamp: serverTimestamp(),
      lastMessage: 'Room created'
    });

    setActiveRoom({ 
      id: roomRef.id, 
      name: newRoomName, 
      subject: newRoomSubject,
      description: newRoomDesc, 
      createdBy: profile.uid, 
      createdAt: new Date() 
    });
    setActiveChat(null);
    setShowCreateRoom(false);
    setNewRoomName('');
    setNewRoomSubject('');
    setNewRoomDesc('');
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || (!activeChat && !activeRoom) || !profile) return;

    const msg = newMessage;
    setNewMessage('');

    const path = activeChat 
      ? `chats/${activeChat.id}/messages` 
      : `rooms/${activeRoom!.id}/messages`;

    const parentDoc = activeChat 
      ? doc(db, 'chats', activeChat.id) 
      : doc(db, 'rooms', activeRoom!.id);

    await addDoc(collection(db, path), {
      senderId: profile.uid,
      senderName: profile.username,
      senderPhoto: profile.photoURL,
      text: msg,
      timestamp: serverTimestamp()
    });

    await updateDoc(parentDoc, {
      lastMessage: msg,
      lastTimestamp: serverTimestamp()
    });
  };

  const getOtherParticipant = (chat: Chat) => {
    const otherId = chat.participants.find(p => p !== profile?.uid);
    return chatProfiles[otherId || ''] || { username: 'Unknown', photoURL: '' };
  };

  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => {
    if (activeChat || activeRoom) {
      setShowSidebar(false);
    } else {
      setShowSidebar(true);
    }
  }, [activeChat, activeRoom]);

  const handleBackToSidebar = () => {
    setActiveChat(null);
    setActiveRoom(null);
    setShowSidebar(true);
  };

  if (loading && !chats.length && !rooms.length) {
    return (
      <div className="h-[calc(100vh-120px)] md:h-[calc(100vh-200px)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-[calc(100vh-120px)] md:h-[calc(100vh-200px)] flex bg-zinc-950/50 backdrop-blur-xl rounded-2xl md:rounded-[2.5rem] border border-white/5 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative"
    >
      {/* Sidebar */}
      <div className={cn(
        "w-full md:w-80 lg:w-96 border-r border-white/5 flex flex-col bg-black/40 relative z-10 transition-all duration-300",
        !showSidebar && "hidden md:flex"
      )}>
        <div className="p-6 md:p-8 border-b border-white/5 space-y-4 md:space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter italic text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 md:w-6 md:h-6 text-red-600" />
              Messages
            </h2>
            <button 
              onClick={() => activeTab === 'dms' ? setShowNewDM(true) : setShowCreateRoom(true)}
              className="p-2 bg-red-600/10 hover:bg-red-600/20 rounded-xl border border-red-600/20 transition-all text-red-500"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="flex p-1 bg-zinc-900/50 rounded-2xl border border-white/5">
            <button
              onClick={() => setActiveTab('dms')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                activeTab === 'dms' ? "bg-red-600 text-white shadow-lg" : "text-zinc-500 hover:text-white"
              )}
            >
              <User className="w-3 h-3" />
              Direct
            </button>
            <button
              onClick={() => setActiveTab('rooms')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                activeTab === 'rooms' ? "bg-red-600 text-white shadow-lg" : "text-zinc-500 hover:text-white"
              )}
            >
              <Users className="w-3 h-3" />
              Rooms
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          <div className="divide-y divide-white/5">
            {activeTab === 'dms' ? (
              chats.map(chat => {
                const other = getOtherParticipant(chat);
                const isActive = activeChat?.id === chat.id;
                return (
                  <motion.button
                    layout
                    key={chat.id}
                    onClick={() => {
                      setActiveChat(chat);
                      setActiveRoom(null);
                    }}
                    className={cn(
                      "w-full flex items-center gap-4 md:gap-5 p-4 md:p-6 transition-all text-left relative group",
                      isActive ? "bg-red-600/10" : "hover:bg-white/5"
                    )}
                  >
                    {isActive && (
                      <motion.div 
                        layoutId="active-chat-indicator"
                        className="absolute left-0 top-0 w-1 h-full bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)]" 
                      />
                    )}
                    <div className="relative flex-shrink-0">
                      <img src={`${other.photoURL}${other.photoURL.includes('?') ? '&' : '?'}t=${Date.now()}`} className="relative w-10 h-10 md:w-14 md:h-14 rounded-full border border-white/10 object-cover shadow-lg" referrerPolicy="no-referrer" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <span className={cn(
                          "text-xs md:text-sm font-black uppercase tracking-tight truncate transition-colors",
                          isActive ? "text-white" : "text-zinc-400 group-hover:text-white"
                        )}>
                          {other.username}
                        </span>
                        <span className="text-[8px] md:text-[9px] text-zinc-600 font-black uppercase tracking-widest">
                          {chat.lastTimestamp?.toDate ? format(chat.lastTimestamp.toDate(), 'HH:mm') : ''}
                        </span>
                      </div>
                      <p className="text-[9px] md:text-[11px] text-zinc-500 truncate font-bold uppercase tracking-wide opacity-70">
                        {chat.lastMessage || 'Start a conversation'}
                      </p>
                    </div>
                  </motion.button>
                );
              })
            ) : (
              rooms.map(room => {
                const isActive = activeRoom?.id === room.id;
                return (
                  <motion.button
                    layout
                    key={room.id}
                    onClick={() => {
                      setActiveRoom(room);
                      setActiveChat(null);
                    }}
                    className={cn(
                      "w-full flex items-center gap-4 md:gap-5 p-4 md:p-6 transition-all text-left relative group",
                      isActive ? "bg-red-600/10" : "hover:bg-white/5"
                    )}
                  >
                    {isActive && (
                      <motion.div 
                        layoutId="active-room-indicator"
                        className="absolute left-0 top-0 w-1 h-full bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)]" 
                      />
                    )}
                    <div className="w-10 h-10 md:w-14 md:h-14 rounded-lg md:rounded-[1.25rem] bg-zinc-900 flex items-center justify-center border border-white/5 group-hover:border-red-600/50 transition-all flex-shrink-0">
                      <Hash className={cn("w-4 h-4 md:w-6 md:h-6 transition-colors", isActive ? "text-red-500" : "text-zinc-600 group-hover:text-red-500")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-xs md:text-sm font-black uppercase tracking-tight truncate transition-colors",
                            isActive ? "text-white" : "text-zinc-400 group-hover:text-white"
                          )}>
                            {room.name}
                          </span>
                          {room.lastTimestamp?.toDate && (Date.now() - room.lastTimestamp.toDate().getTime() < 300000) && (
                            <span className="flex h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
                          )}
                        </div>
                        <span className="text-[8px] md:text-[9px] text-zinc-600 font-black uppercase tracking-widest">
                          {room.lastTimestamp?.toDate ? format(room.lastTimestamp.toDate(), 'HH:mm') : ''}
                        </span>
                      </div>
                      <p className="text-[9px] md:text-[11px] text-zinc-500 truncate font-bold uppercase tracking-wide opacity-70">
                        {room.subject ? `[${room.subject}] ` : ''}{room.lastMessage || room.description}
                      </p>
                    </div>
                  </motion.button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className={cn(
        "flex-1 flex flex-col bg-zinc-950/30 relative transition-all duration-300",
        showSidebar && "hidden md:flex"
      )}>
        {(activeChat || activeRoom) ? (
          <>
            <div className="p-4 md:p-8 border-b border-white/5 flex items-center justify-between bg-black/20 backdrop-blur-md sticky top-0 z-20">
              <div className="flex items-center gap-3 md:gap-5">
                <button 
                  onClick={handleBackToSidebar}
                  className="md:hidden p-2 text-zinc-500 hover:text-white transition-colors"
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <div className="relative">
                  {activeChat ? (
                    <img src={`${getOtherParticipant(activeChat).photoURL}${getOtherParticipant(activeChat).photoURL.includes('?') ? '&' : '?'}t=${Date.now()}`} className="relative w-10 h-10 md:w-12 md:h-12 rounded-full border border-white/10 object-cover shadow-xl" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-red-600/20 flex items-center justify-center border border-red-600/30">
                      <Hash className="w-5 h-5 md:w-6 md:h-6 text-red-500" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm md:text-lg font-black uppercase tracking-tight italic truncate">
                    {activeChat ? getOtherParticipant(activeChat).username : activeRoom?.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="text-[8px] md:text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] truncate">
                      {activeChat ? 'Active Now' : activeRoom?.description}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 md:space-y-8 no-scrollbar scroll-smooth">
              {messages.map((msg, i) => {
                const isMe = msg.senderId === profile?.uid;
                return (
                  <motion.div 
                    initial={{ opacity: 0, x: isMe ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={i} 
                    className={cn("flex flex-col", isMe ? "items-end" : "items-start")}
                  >
                    {!isMe && activeRoom && (
                      <div className="flex items-center gap-2 mb-2 px-2">
                        <img src={msg.senderPhoto} className="w-4 h-4 md:w-5 md:h-5 rounded-full border border-white/10" referrerPolicy="no-referrer" />
                        <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-zinc-500">{msg.senderName}</span>
                      </div>
                    )}
                    <div className={cn(
                      "max-w-[85%] md:max-w-[70%] p-4 md:p-5 rounded-2xl md:rounded-[2rem] text-xs md:text-sm font-bold leading-relaxed shadow-2xl relative group",
                      isMe 
                        ? "bg-red-600 text-white rounded-tr-none shadow-[0_10px_30px_rgba(220,38,38,0.2)]" 
                        : "bg-zinc-900/80 backdrop-blur-md text-zinc-300 rounded-tl-none border border-white/5"
                    )}>
                      {msg.text}
                    </div>
                    <span className="text-[6px] md:text-[8px] text-zinc-600 font-black uppercase tracking-[0.2em] mt-2 md:mt-3 px-2">
                      {msg.timestamp?.toDate ? format(msg.timestamp.toDate(), 'HH:mm') : ''}
                    </span>
                  </motion.div>
                );
              })}
              <div ref={scrollRef} />
            </div>

            <div className="p-4 md:p-8 bg-black/40 backdrop-blur-xl border-t border-white/5">
              <form onSubmit={sendMessage} className="max-w-4xl mx-auto flex gap-2 md:gap-4 relative group">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="relative flex-1 bg-zinc-900/50 border border-white/5 rounded-xl md:rounded-[1.5rem] px-4 md:px-8 py-3 md:py-5 text-xs md:text-sm font-bold focus:ring-1 focus:ring-red-600 focus:bg-zinc-900 transition-all placeholder:text-zinc-600"
                />
                <button 
                  type="submit" 
                  disabled={!newMessage.trim()}
                  className="relative p-3 md:p-5 bg-red-600 text-white rounded-xl md:rounded-[1.5rem] hover:bg-red-700 transition-all shadow-[0_10px_30px_rgba(220,38,38,0.3)] hover:shadow-[0_15px_40px_rgba(220,38,38,0.4)] hover:-translate-y-1 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
                >
                  <Send className="w-5 h-5 md:w-6 md:h-6" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-800 space-y-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.05)_0%,transparent_70%)]"></div>
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative w-24 h-24 md:w-32 md:h-32 bg-zinc-900/50 rounded-[2rem] md:rounded-[2.5rem] flex items-center justify-center border border-white/5 shadow-2xl"
            >
              <MessageSquare className="w-10 h-10 md:w-12 md:h-12 text-zinc-700" />
              <div className="absolute -inset-4 bg-red-600/5 blur-3xl rounded-full animate-pulse"></div>
            </motion.div>
            <div className="text-center relative px-6">
              <h3 className="text-lg md:text-xl font-black uppercase tracking-tighter italic text-zinc-700 mb-2">Secure Channel</h3>
              <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.4em] text-zinc-800">Select a {activeTab === 'dms' ? 'chat' : 'room'} to begin transmission</p>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCreateRoom && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateRoom(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-zinc-950 border border-white/10 rounded-[2.5rem] p-10 shadow-3xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-transparent"></div>
              <button 
                onClick={() => setShowCreateRoom(false)}
                className="absolute top-6 right-6 p-2 text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              
              <h3 className="text-3xl font-black uppercase tracking-tighter italic mb-8">Create Room</h3>
              <form onSubmit={createRoom} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 px-2">Room Name</label>
                  <input
                    autoFocus
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="e.g. Freestyle Friday"
                    className="w-full bg-zinc-900/50 border border-white/5 rounded-2xl px-6 py-4 text-sm font-bold focus:ring-1 focus:ring-red-600 focus:bg-zinc-900 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 px-2">Subject / Topic</label>
                  <input
                    type="text"
                    value={newRoomSubject}
                    onChange={(e) => setNewRoomSubject(e.target.value)}
                    placeholder="e.g. Old School Hip Hop"
                    className="w-full bg-zinc-900/50 border border-white/5 rounded-2xl px-6 py-4 text-sm font-bold focus:ring-1 focus:ring-red-600 focus:bg-zinc-900 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 px-2">Description</label>
                  <textarea
                    value={newRoomDesc}
                    onChange={(e) => setNewRoomDesc(e.target.value)}
                    placeholder="What's this room about?"
                    className="w-full bg-zinc-900/50 border border-white/5 rounded-2xl px-6 py-4 text-sm font-bold focus:ring-1 focus:ring-red-600 focus:bg-zinc-900 transition-all h-24 resize-none"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={!newRoomName.trim()}
                  className="w-full py-5 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-xl disabled:opacity-50"
                >
                  Launch Room
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {showNewDM && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNewDM(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-zinc-950 border border-white/10 rounded-[2.5rem] p-10 shadow-3xl overflow-hidden"
            >
              <button 
                onClick={() => setShowNewDM(false)}
                className="absolute top-6 right-6 p-2 text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              
              <h3 className="text-3xl font-black uppercase tracking-tighter italic mb-8">New Message</h3>
              <div className="space-y-6">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by username..."
                    className="w-full bg-zinc-900/50 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold focus:ring-1 focus:ring-red-600 focus:bg-zinc-900 transition-all"
                  />
                </div>
                
                <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
                  {searchResults.map(user => (
                    <button
                      key={user.uid}
                      type="button"
                      onClick={() => startChat(user)}
                      className="w-full flex items-center gap-4 p-4 hover:bg-white/5 rounded-2xl transition-all group"
                    >
                      <img src={`${user.photoURL}${user.photoURL.includes('?') ? '&' : '?'}t=${Date.now()}`} className="w-10 h-10 rounded-full border border-white/10 object-cover" referrerPolicy="no-referrer" />
                      <span className="text-sm font-black uppercase tracking-tight group-hover:text-red-500 transition-colors">{user.username}</span>
                      <ChevronRight className="w-4 h-4 ml-auto text-zinc-600" />
                    </button>
                  ))}
                  {searchQuery && searchResults.length === 0 && (
                    <p className="text-center text-xs text-zinc-600 font-bold uppercase tracking-widest py-8">No artists found</p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
