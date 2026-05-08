'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession, signIn, signOut } from "next-auth/react";

// Define the supported templates
const TEMPLATES = {
  python: `def main():\n    print("Hello from the Python Queue!")\n\nif __name__ == "__main__":\n    main()`,
  'c++': `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello from the C++ Queue!" << endl;\n    return 0;\n}`
};

// Force Next.js to only render this component on the client side
const Editor = dynamic(
  () => import('./components/CollaborativeEditor') as any,
  { ssr: false }
) as ComponentType<{
  roomName: string;
  language: string;
  onCodeChange?: (newCode: string) => void;
}>;

export default function Home() {
  // Guard against hydration mismatch (Client-only rendering for auth UI)
  const [isMounted, setIsMounted] = useState(false);

  // NextAuth State
  const { data: session, status } = useSession();
  const isSignedIn = status === "authenticated";

  // Editor & Execution State
  const [language, setLanguage] = useState<string>("python");
  const [code, setCode] = useState<string>(TEMPLATES["python"]);
  const [output, setOutput] = useState<string>("Waiting for execution engine...");
  const [isExecuting, setIsExecuting] = useState(false);

  // Room State
  const [joinRoomId, setJoinRoomId] = useState("");
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  // Dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // New Sidebar State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userRooms, setUserRooms] = useState<any[]>([]);

  // Fetch rooms when sidebar opens
  const handleOpenSidebar = async () => {
    setIsSidebarOpen(true);
    try {
      const res = await fetch('/api/rooms');
      if (res.ok) {
        const data = await res.json();
        setUserRooms(data);
      }
    } catch (error) {
      console.error("Failed to fetch rooms", error);
    }
  };

  // Switch rooms instantly
  const handleSwitchRoom = (roomId: string) => {
    
    setActiveRoomId(roomId);
    router.push(`/?room=${roomId}`);
    setIsSidebarOpen(false); // Close sidebar after clicking
  };

  // Create a new room from the sidebar
  const handleCreateNewRoom = () => {
    // Generate a random room ID (use whatever format you were using before)
    const newRoomId = `r-${Math.random().toString(36).substring(2, 8)}`; 
    
    // Update state and URL
    setActiveRoomId(newRoomId);
    router.push(`/?room=${newRoomId}`);
    
    // Close the sidebar so they can start typing immediately
    setIsSidebarOpen(false);
  };

  // Delete room instantly
  const handleDeleteRoom = async (e: React.MouseEvent, roomIdToDelete: string) => {
    e.stopPropagation(); // CRITICAL: Stops the click from opening the room instead

    if (!window.confirm("Are you sure you want to delete this room?")) return;

    try {
      const res = await fetch(`/api/room/${roomIdToDelete}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        // 1. Remove it from the sidebar visually instantly
        setUserRooms(prev => prev.filter(room => room.roomId !== roomIdToDelete));

        // 2. If they just deleted the room they are currently looking at, kick them out
        if (activeRoomId === roomIdToDelete) {
          setActiveRoomId(null);
          router.push('/');
        }
      }
    } catch (error) {
      console.error("Failed to delete room", error);
    }
  };

  // Ref for our auto-save timer
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check the URL for a room ID when the page first loads or refreshes
  useEffect(() => {
    const roomFromUrl = searchParams.get('room');
    if (roomFromUrl) {
      setActiveRoomId(roomFromUrl);
    }
  }, [searchParams]);

  // Trigger mount flag
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 1. Fetch Room Logic
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
        // Tell Next.js to update the URL bar without reloading the page:
        router.push(`/?room=${joinRoomId}`);
        setOutput(`✅ Successfully joined permanent room: ${joinRoomId}`);
      } else {
        setOutput(`❌ Room ${joinRoomId} not found in database.`);
      }
    } catch (err) {
      setOutput(`❌ Network error while joining room.`);
    }
  };

  // 2. Create Permanent Room Logic
  const handleCreatePermanentRoom = () => {
    if (!isSignedIn) return;
    // Generate a simple random room ID (e.g., "r-4f8a2")
    const newRoomId = "r-" + Math.random().toString(36).substring(2, 7);
    setActiveRoomId(newRoomId);
    // Tell Next.js to update the URL bar without reloading the page:
    router.push(`/?room=${newRoomId}`);
    setOutput(`✅ Created permanent room: ${newRoomId}. Your code will now auto-save.`);
  };

  // 3. Auto-Save Logic (Debounced) - Only fires if logged in and inside a real room
  useEffect(() => {
    if (!isSignedIn || !activeRoomId) return;

    // Clear the previous timer if they keep typing
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    // Set a new timer to save after 2 seconds of inactivity
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/room/${activeRoomId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, language }),
        });

        if (!res.ok) {
          console.error(`Failed to auto-save. Server status: ${res.status}`);
        } else {
          console.log(`Auto-saved to room ${activeRoomId}`);
        }
      } catch (err) {
        console.error("Auto-save failed", err);
      }
    }, 2000);

    // Cleanup function
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [code, language, activeRoomId, isSignedIn]);

  // Handle dropdown language switches
  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    if (newLang in TEMPLATES) {
      setCode(TEMPLATES[newLang as keyof typeof TEMPLATES]);
    }
  };

  // Execution Logic
  const handleRunCode = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    setOutput("Compiling and running in secure sandbox...");

    try {
      const res = await fetch("http://16.176.136.186/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code })
      });

      if (!res.ok) throw new Error(`Server returned status ${res.status}`);

      const data = await res.json();
      const jobId = data.job_id;

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`http://16.176.136.186/status/${jobId}`);
          const statusData = await statusRes.json();

          if (statusData.status === "completed") {
            clearInterval(pollInterval);
            setIsExecuting(false);
            if (statusData.result.error) {
              setOutput(statusData.result.error);
            } else {
              setOutput(statusData.result.output || "Program finished with exit code 0 (Empty output).");
            }
          } else if (statusData.status === "failed") {
            clearInterval(pollInterval);
            setIsExecuting(false);
            setOutput(`❌ Queue Error: ${statusData.error}`);
          } else {
            setOutput("Running...");
          }
        } catch (pollErr) {
          clearInterval(pollInterval);
          setIsExecuting(false);
          setOutput(`❌ Connection lost while checking status.`);
        }
      }, 1000);

    } catch (err) {
      setIsExecuting(false);
      setOutput(`❌ Network Error: Could not connect to execution engine.`);
    }
  };

  return (
    <main className="flex h-screen w-full flex-col bg-[#1e1e1e] text-white">
      <nav className="flex h-16 items-center justify-between border-b border-gray-700 px-6">
        <div className="flex items-center gap-4">

          <h1 className="text-xl font-bold tracking-tight">
            Smart<span className="text-blue-500">_Code</span>
          </h1>
          <button
            onClick={handleOpenSidebar}
            className="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-md transition-colors"
          >
            {/* Simple SVG Hamburger Icon */}
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          {activeRoomId && (
            <span className="bg-green-900/50 text-green-400 border border-green-700 px-2 py-1 rounded text-xs font-mono animate-fade-in">
              Room: {activeRoomId} (Auto-saving)
            </span>
          )}
        </div>

        {/* Middle: Room Joiner */}
        <form onSubmit={handleJoinRoom} className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
          <input
            type="text"
            placeholder="Enter Room ID..."
            value={joinRoomId}
            onChange={(e) => setJoinRoomId(e.target.value)}
            className="bg-[#2d2d2d] text-white px-3 py-1.5 rounded border border-gray-700 outline-none focus:border-blue-500 text-sm w-48"
          />
          <button type="submit" className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-sm font-semibold transition-all">
            Join
          </button>
        </form>

        {/* Right Side: Actions & Auth */}
        <div className="flex items-center gap-4">

          {/* Language Selector Dropdown */}
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            disabled={isExecuting}
            className="bg-[#2d2d2d] text-white px-3 py-1.5 rounded border border-gray-700 outline-none cursor-pointer hover:border-gray-600 focus:border-blue-500 transition-all text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="python">Python 3</option>
            <option value="c++">C++ (GCC)</option>
          </select>

          {/* Execution Button */}
          <button
            onClick={handleRunCode}
            disabled={isExecuting}
            className={`px-4 py-1.5 rounded font-bold transition-all text-sm ${isExecuting
              ? 'bg-gray-600 cursor-not-allowed text-gray-400'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]'
              }`}
          >
            {isExecuting ? 'Running...' : '▶ Run Code'}
          </button>

          {/* Hydration-Safe Authentication UI */}
          {/* NextAuth UI */}
          <div className="ml-2 border-l border-gray-700 pl-4 flex items-center min-w-[100px] justify-center">
            {status === "loading" ? (
              <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
            ) : !isSignedIn ? (
              <button
                onClick={() => signIn('google')}
                className="bg-white text-black hover:bg-gray-200 px-4 py-1.5 rounded text-sm font-bold transition-all"
              >
                Sign In
              </button>
            ) : (
              <div className="flex items-center gap-3">
                {!activeRoomId && (
                  <button
                    onClick={handleCreatePermanentRoom}
                    className="bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-1.5 rounded text-xs font-bold transition-all whitespace-nowrap shadow-[0_0_12px_rgba(147,51,234,0.3)]"
                  >
                    + Create Room
                  </button>
                )}
                {/* Simple Profile Pic & Logout */}
                {/* Upgraded Profile Dropdown */}
                <div className="relative">
                  <img
                    src={session?.user?.image || ""}
                    alt="Profile"
                    className="w-8 h-8 rounded-full border border-gray-600 cursor-pointer hover:ring-2 hover:ring-purple-500 transition-all"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  />

                  {isDropdownOpen && (
                    <div className="absolute right-0 mt-3 w-40 bg-gray-900 rounded-md shadow-xl py-1 border border-gray-700 z-50">
                      <Link
                        href="/dashboard"
                        className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        Dashboard
                      </Link>
                      <hr className="border-gray-700" />
                      <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-800 hover:text-red-300 transition-colors"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Editor Section */}
        <div className="flex-[2] border-r border-gray-700 p-4 relative">
          <div className="h-full w-full rounded-lg bg-[#0d0d0d] overflow-hidden border border-gray-800 absolute inset-4 right-2">
            <Editor
              key={activeRoomId}
              roomName={activeRoomId || "temporary-guest-room"}
              language={language}
              onCodeChange={(newCode) => setCode(newCode)}
            />
          </div>
        </div>

        {/* Terminal Section */}
        <div className="flex-[1] flex flex-col p-4 bg-[#181818] relative">
          <h2 className="text-sm font-semibold text-gray-400 mb-2">AWS Live Logs</h2>
          <div className="flex-1 rounded bg-black p-4 font-mono text-sm overflow-y-auto whitespace-pre-wrap border border-gray-800">
            {output.includes('❌') ? (
              <span className="text-red-400">{output}</span>
            ) : (
              <span className="text-green-400">{output}</span>
            )}
          </div>
        </div>
        {/* Sidebar Overlay (Darkens background) */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sliding Sidebar */}
        <div
          className={`fixed top-0 left-0 h-full w-80 bg-gray-900 border-r border-gray-700 z-50 transform transition-transform duration-300 ease-in-out overflow-y-auto ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
        >
          <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white">My Rooms</h2>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* --- NEW ROOM BUTTON --- */}
          <button
            onClick={handleCreateNewRoom}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded-lg mb-6 transition-colors flex items-center justify-center gap-2 shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Room
          </button>
          {/* ----------------------- */}

          <div className="flex flex-col gap-3">
            {userRooms.length === 0 ? (
              <p className="text-gray-500 text-sm">No saved rooms found.</p>
            ) : (
             
              userRooms.map((room) => (
                <div 
                  key={room.roomId} 
                  onClick={() => handleSwitchRoom(room.roomId)}
                  className={`p-4 rounded-lg cursor-pointer border transition-all flex justify-between items-center group ${
                    activeRoomId === room.roomId 
                      ? 'bg-purple-900 border-purple-500' 
                      : 'bg-gray-800 border-gray-700 hover:border-gray-500'
                  }`}
                >
                  {/* Left Side: Room Info */}
                  <div>
                    <p className="font-mono text-sm text-purple-300 truncate">{room.roomId}</p>
                    <p className="text-xs text-gray-400 mt-1">Language: {room.language || 'python'}</p>
                  </div>

                  {/* Right Side: Delete Button */}
                  <button
                    onClick={(e) => handleDeleteRoom(e, room.roomId)}
                    className="text-gray-500 hover:text-red-400 transition-colors p-2 opacity-0 group-hover:opacity-100"
                    title="Delete Room"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))
            )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}