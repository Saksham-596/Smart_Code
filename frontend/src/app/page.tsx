'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
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
  
  // Ref for our auto-save timer
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

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
                 <img 
                    src={session?.user?.image || ""} 
                    alt="Profile" 
                    className="w-8 h-8 rounded-full border border-gray-600 cursor-pointer hover:opacity-80"
                    onClick={() => signOut()}
                    title="Click to Sign Out"
                 />
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
      </div>
    </main>
  );
}