'use client'

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

// Force Next.js to only render this component on the client side
const Editor = dynamic(
  () => import('./components/CollaborativeEditor') as any, 
  { ssr: false } // This is the magic flag
) as ComponentType<{ roomName: string; onCodeChange?: (newCode: string) => void }>;

export default function Home() {
  const [output, setOutput] = useState<string>("Waiting for execution engine...");
  const [isExecuting, setIsExecuting] = useState(false);
  const [code, setCode] = useState("");

  const executeCode = async () => {
    setIsExecuting(true);
    setOutput("Sending payload to AWS Engine...\nExecuting...");

    try {
      // Direct connection to your live AWS server on standard HTTP Port 80
      const response = await fetch('http://16.176.136.186/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language: 'python',
          code: code
        }),
      });

      // The missing security check!
      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        setOutput(`❌ Engine Error:\n${data.error}`);
      } else {
        setOutput(`✅ Success:\n${data.output}`);
      }
    } catch (error) {
      setOutput("❌ Failed to connect to AWS. Is the EC2 server running?");
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <main className="flex h-screen w-full flex-col bg-[#1e1e1e] text-white">
      <nav className="flex h-16 items-center justify-between border-b border-gray-700 px-6">
        <h1 className="text-xl font-bold tracking-tight">
          Smart<span className="text-blue-500">_Code</span>
        </h1>
        <button 
          onClick={executeCode}
          disabled={isExecuting}
          className={`px-4 py-2 rounded-md font-bold transition-all ${
            isExecuting 
              ? 'bg-gray-600 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.5)]'
          }`}
        >
          {isExecuting ? 'Running...' : '▶ Run Code'}
        </button>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Editor Section */}
        <div className="flex-[2] border-r border-gray-700 p-4 relative">
          <div className="h-full w-full rounded-lg bg-[#0d0d0d] overflow-hidden border border-gray-800 absolute inset-4 right-2">
            <Editor 
              roomName="test-room"
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