'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession, signIn, signOut } from "next-auth/react";

// Define the supported templates
const TEMPLATES = {
  python: " ",
  'c++': " ",
};

// Force Next.js to only render this component on the client side
const Editor = dynamic(
  () => import('./components/CollaborativeEditor') as any,
  { ssr: false }
) as ComponentType<{
  roomName: string;
  language: string;
  onCodeChange?: (newCode: string) => void;
  userName: string;
  userImage?: string | null;
  onUsersChange?: (users: any[]) => void;
}>;

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const { data: session, status } = useSession();
  const isSignedIn = status === "authenticated";

  const [language, setLanguage] = useState<string>("python");
  const [code, setCode] = useState<string>(TEMPLATES["python"]);
  const [customInput, setCustomInput] = useState("");
  const [output, setOutput] = useState<string>("System initialized. Waiting for execution payload...");
  const [isExecuting, setIsExecuting] = useState(false);

  const [joinRoomId, setJoinRoomId] = useState("");
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userRooms, setUserRooms] = useState<any[]>([]);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const roomFromUrl = searchParams.get('room');
    if (roomFromUrl) setActiveRoomId(roomFromUrl);
  }, [searchParams]);

  useEffect(() => setIsMounted(true), []);

  const handleOpenSidebar = async () => {
    setIsSidebarOpen(true);
    try {
      const res = await fetch('/api/rooms');
      if (res.ok) setUserRooms(await res.json());
    } catch (error) { console.error("Failed to fetch rooms", error); }
  };

  const handleSwitchRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    router.push(`/?room=${roomId}`);
    setIsSidebarOpen(false);
  };

  const handleCreateNewRoom = () => {
    const newRoomId = `r-${Math.random().toString(36).substring(2, 8)}`;
    setActiveRoomId(newRoomId);
    router.push(`/?room=${newRoomId}`);
    setIsSidebarOpen(false);
  };

  const handleDeleteRoom = async (e: React.MouseEvent, roomIdToDelete: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this room?")) return;
    try {
      const res = await fetch(`/api/room/${roomIdToDelete}`, { method: 'DELETE' });
      if (res.ok) {
        setUserRooms(prev => prev.filter(room => room.roomId !== roomIdToDelete));
        if (activeRoomId === roomIdToDelete) {
          setActiveRoomId(null);
          router.push('/');
        }
      }
    } catch (error) { console.error("Failed to delete room", error); }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinRoomId.trim()) return;
    try {
      const res = await fetch(`/api/room/${joinRoomId}`);
      if (res.ok) {
        const data = await res.json();
        setCode(data.code || TEMPLATES[data.language as keyof typeof TEMPLATES] || "");
        setLanguage(data.language || "python");
        setActiveRoomId(joinRoomId);
        router.push(`/?room=${joinRoomId}`);
        setOutput(`> Connected to remote session: ${joinRoomId}`);
      } else {
        setOutput(`> ERROR: Session ${joinRoomId} not found.`);
      }
    } catch (err) { setOutput(`> ERROR: Network connection failed.`); }
  };

  const handleCreatePermanentRoom = () => {
    if (!isSignedIn) return;
    const newRoomId = "r-" + Math.random().toString(36).substring(2, 7);
    setActiveRoomId(newRoomId);
    router.push(`/?room=${newRoomId}`);
    setOutput(`> Cloud workspace established: ${newRoomId}. CRDT auto-sync active.`);
  };

  useEffect(() => {
    if (!isSignedIn || !activeRoomId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/room/${activeRoomId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, language }),
        });
      } catch (err) { console.error("Auto-save failed", err); }
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [code, language, activeRoomId, isSignedIn]);

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    if (newLang in TEMPLATES) setCode(TEMPLATES[newLang as keyof typeof TEMPLATES]);
  };

  const handleRunCode = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    setOutput("> Compiling and routing payload to secure AWS worker nodes...\n> Executing...");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code, stdin: customInput }),
      });

      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const data = await res.json();
      const jobId = data.job_id;

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/status/${jobId}`);
          const statusData = await statusRes.json();

          if (statusData.status === "completed") {
            clearInterval(pollInterval);
            setIsExecuting(false);
            setOutput(statusData.result.error ? `> PROCESS EXITED WITH ERROR:\n\n${statusData.result.error}` : `> PROCESS FINISHED SUCCESSFULLY:\n\n${statusData.result.output || "Exit code 0 (No output)"}`);
          } else if (statusData.status === "failed") {
            clearInterval(pollInterval);
            setIsExecuting(false);
            setOutput(`> FATAL QUEUE ERROR: ${statusData.error}`);
          }
        } catch (pollErr) {
          clearInterval(pollInterval);
          setIsExecuting(false);
          setOutput(`> ERROR: Disconnected from execution engine.`);
        }
      }, 1000);
    } catch (err) {
      setIsExecuting(false);
      setOutput(`> ERROR: Handshake with AWS worker failed.`);
    }
  };

  if (!isMounted) return null;

  return (
    <main className="flex h-screen w-full flex-col bg-[#09090b] text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* 🔮 Glassmorphism Navbar */}
      <nav className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 bg-[#09090b]/80 backdrop-blur-xl px-6 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-5">
          <button
            onClick={handleOpenSidebar}
            className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all hover:scale-105 active:scale-95"
          >
            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-xl font-extrabold tracking-tight">
            Smart<span className="bg-gradient-to-r from-indigo-500 to-cyan-400 bg-clip-text text-transparent">Code</span>
          </h1>
          {activeRoomId && (
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full animate-in fade-in slide-in-from-left-4 duration-500">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-mono text-emerald-400 font-medium">Session: {activeRoomId}</span>
            </div>
          )}
        </div>

        {/* Floating Join Input */}
        <form onSubmit={handleJoinRoom} className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 group hidden md:flex">
          <div className="relative flex items-center transition-all duration-300 focus-within:ring-2 focus-within:ring-indigo-500/50 rounded-full border border-white/10 bg-black/50">
            <input
              type="text"
              placeholder="Join Session ID..."
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              className="bg-transparent text-zinc-300 px-4 py-2 w-56 text-sm outline-none placeholder:text-zinc-600 font-mono"
            />
            <button type="submit" className="pr-2 pl-2 py-1 mr-1 text-xs font-bold text-zinc-400 hover:text-white transition-colors">
              JOIN
            </button>
          </div>
        </form>

        <div className="flex items-center gap-4">
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            disabled={isExecuting}
            className="bg-zinc-900 text-zinc-300 px-4 py-2 rounded-xl border border-white/10 outline-none hover:border-white/20 focus:border-indigo-500 transition-all text-sm font-medium disabled:opacity-50 appearance-none cursor-pointer"
          >
            <option value="python">Python 3.11</option>
            <option value="c++">C++ (GCC 11)</option>
          </select>

          <button
            onClick={handleRunCode}
            disabled={isExecuting}
            className={`flex items-center gap-2 px-6 py-2 rounded-xl font-semibold transition-all text-sm shadow-lg overflow-hidden relative ${
              isExecuting
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5'
                : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white border border-indigo-500/50 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:-translate-y-0.5'
            }`}
          >
            {isExecuting ? (
              <><div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" /> Executing...</>
            ) : (
              <><svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg> Run Code</>
            )}
          </button>

          <div className="pl-4 border-l border-white/10 flex items-center min-w-[100px] justify-end">
            {status === "loading" ? (
              <div className="w-9 h-9 rounded-full bg-zinc-800 animate-pulse border border-white/5" />
            ) : !isSignedIn ? (
              <button
                onClick={() => signIn('google')}
                className="bg-white text-black hover:bg-zinc-200 px-5 py-2 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-white/10"
              >
                Sign In
              </button>
            ) : (
              <div className="flex items-center gap-4">
                {!activeRoomId && (
                  <button
                    onClick={handleCreatePermanentRoom}
                    className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 to-purple-500 hover:opacity-80 transition-opacity"
                  >
                    + New Session
                  </button>
                )}
                <div className="relative">
                  <img
                    src={session?.user?.image || ""}
                    alt="Profile"
                    className="w-9 h-9 rounded-full border-2 border-zinc-800 cursor-pointer hover:border-indigo-500 transition-all shadow-md object-cover"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  />
                  {isDropdownOpen && (
                    <div className="absolute right-0 mt-3 w-48 bg-zinc-900 rounded-2xl shadow-2xl py-2 border border-white/10 z-50 animate-in slide-in-from-top-2">
                      <div className="px-4 py-2 mb-2 border-b border-white/5">
                        <p className="text-xs text-zinc-500 font-mono truncate">{session?.user?.email}</p>
                      </div>
                      <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/5 transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        Disconnect
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* 🚀 Main Workspace Grid */}
      <div className="flex-1 overflow-hidden p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-10 gap-4 lg:gap-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#13131a] to-[#09090b]">
        
        {/* Left Column: The Editor */}
        <div className="lg:col-span-7 rounded-2xl border border-white/5 bg-[#0e0e11] flex flex-col overflow-hidden shadow-2xl relative group">
          {/* Editor Header Bar */}
          <div className="h-10 border-b border-white/5 bg-[#09090b]/50 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-500">main.{language === 'python' ? 'py' : 'cpp'}</span>
            </div>
            {/* Live Roster */}
            {activeRoomId && activeUsers.length > 0 && (
              <div className="flex -space-x-2">
                {activeUsers.map((user, idx) => (
                  <div
                    key={idx}
                    className="w-6 h-6 rounded-full border-2 border-[#0e0e11] flex items-center justify-center text-[10px] font-bold text-white shadow-md z-10 transition-transform hover:scale-110 hover:z-20"
                    style={{ backgroundColor: user.color || '#6366f1' }}
                    title={user.name}
                  >
                    {user.image ? <img src={user.image} alt={user.name} className="w-full h-full rounded-full object-cover" /> : user.name?.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 relative">
            <Editor
              key={activeRoomId}
              roomName={activeRoomId || "temporary-guest-room"}
              language={language}
              onCodeChange={(newCode) => setCode(newCode)}
              userName={session?.user?.name || 'Anonymous User'}
              userImage={session?.user?.image || null}
              onUsersChange={setActiveUsers}
            />
          </div>
        </div>

        {/* Right Column: Terminals */}
        {/* ADDED min-h-0 and overflow-hidden HERE to strictly lock the column height */}
        <div className="lg:col-span-3 flex flex-col gap-4 lg:gap-6 h-full min-h-0 overflow-hidden">
          
          {/* Custom Input */}
          {/* ADDED min-h-0 here too */}
          <div className="flex-1 min-h-0 rounded-2xl border border-white/5 bg-[#0e0e11] flex flex-col shadow-xl overflow-hidden focus-within:border-indigo-500/50 transition-colors">
            <div className="h-10 shrink-0 border-b border-white/5 bg-[#09090b]/50 flex items-center px-4">
              <span className="text-xs font-bold text-zinc-400 tracking-wider">STDIN</span>
            </div>
            <textarea
              className="flex-1 min-h-0 w-full p-4 bg-transparent text-zinc-300 font-mono text-sm resize-none outline-none placeholder:text-zinc-700"
              placeholder="Inject custom input stream here..."
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
            />
          </div>

          {/* Execution Output */}
          <div className="flex-[2] min-h-0 rounded-2xl border border-white/5 bg-black flex flex-col shadow-2xl relative overflow-hidden">
            {/* Terminal Top Bar */}
            <div className="h-10 shrink-0 border-b border-white/10 bg-[#18181b] flex items-center px-4 gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50" />
              </div>
              <span className="ml-2 text-xs font-bold text-zinc-500 tracking-wider">STDOUT</span>
            </div>
            
            {/* The actual scrolling text area */}
            <div className="flex-1 min-h-0 p-4 font-mono text-[13px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {output.includes('ERROR') || output.includes('❌') ? (
                <span className="text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.3)]">{output}</span>
              ) : output.includes('SUCCESS') ? (
                <span className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">{output}</span>
              ) : (
                <span className="text-zinc-400">{output}</span>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* 🌑 Sidebar Overlay & Panel */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-all animate-in fade-in"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div
        className={`fixed top-0 left-0 h-full w-80 bg-[#09090b] border-r border-white/10 z-50 shadow-2xl transform transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1) flex flex-col ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#0e0e11]/50">
          <h2 className="text-lg font-bold text-white tracking-tight">Active Sessions</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="text-zinc-500 hover:text-white transition-colors bg-white/5 p-2 rounded-lg hover:bg-white/10">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          <button
            onClick={handleCreateNewRoom}
            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-3 px-4 rounded-xl mb-6 transition-all flex items-center justify-center gap-2 hover:border-indigo-500/50 hover:shadow-[0_0_15px_rgba(99,102,241,0.2)] group"
          >
            <svg className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Initialize Workspace
          </button>

          <div className="flex flex-col gap-3">
            {userRooms.length === 0 ? (
              <div className="text-center p-6 border border-white/5 rounded-xl border-dashed">
                <p className="text-zinc-500 text-sm">No saved sessions found.</p>
              </div>
            ) : (
              userRooms.map((room) => (
                <div
                  key={room.roomId}
                  onClick={() => handleSwitchRoom(room.roomId)}
                  className={`p-4 rounded-xl cursor-pointer border transition-all flex justify-between items-center group relative overflow-hidden ${
                    activeRoomId === room.roomId
                      ? 'bg-indigo-500/10 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                      : 'bg-white/5 border-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="relative z-10">
                    <p className={`font-mono text-sm font-bold ${activeRoomId === room.roomId ? 'text-indigo-300' : 'text-zinc-300'} truncate`}>{room.roomId}</p>
                    <p className="text-xs text-zinc-500 mt-1 uppercase tracking-wider">{room.language || 'python'}</p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteRoom(e, room.roomId)}
                    className="relative z-10 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                  {/* Subtle highlight gradient on hover */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}