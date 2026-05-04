import CollaborativeEditor from './components/CollaborativeEditor';

export default function Home() {
  return (
    <main className="flex h-screen w-full flex-col bg-[#1e1e1e] text-white">
      <nav className="flex h-16 items-center justify-between border-b border-gray-700 px-6">
        <h1 className="text-xl font-bold tracking-tight">
          Smart<span className="text-blue-500">_Code</span>
        </h1>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-[2] border-r border-gray-700 p-4">
          <div className="h-full w-full rounded-lg bg-[#0d0d0d] overflow-hidden border border-gray-800">
             {/* Hardcoding room "test-room" for now */}
            <CollaborativeEditor roomName="test-room" />
          </div>
        </div>
        
        <div className="flex-1 p-4 bg-[#181818]">
          <h2 className="text-sm font-semibold text-gray-400">System Logs</h2>
          <p className="text-xs text-gray-500 mt-2">Waiting for execution engine...</p>
        </div>
      </div>
    </main>
  );
}