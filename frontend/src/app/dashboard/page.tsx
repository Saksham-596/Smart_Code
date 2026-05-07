import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import clientPromise from "../lib/mongodb";
import { redirect } from "next/navigation";

import Link from "next/dist/client/link";

export default async function DashboardPage() {
  // 1. Check if they are logged in
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/"); // Kick them out if not logged in
  }

  // 2. Fetch their specific rooms from MongoDB
  const client = await clientPromise;
  const db = client.db('smartcode_db');
  
  // Sort by newest first
  const userRooms = await db.collection('rooms')
    .find({ creatorId: session.user?.email })
    .sort({ lastUpdated: -1 }) 
    .toArray();

  return (
    <div className="min-h-screen bg-gray-900 text-white p-10">
      <h1 className="text-3xl font-bold mb-8">My Rooms</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {userRooms.map((room) => (
          <div key={room.roomId} className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <Link href={`/?room=${room.roomId}`}>
              <h2 className="text-xl font-mono text-purple-400 hover:text-purple-300 hover:underline cursor-pointer transition-colors">
                {room.roomId}
              </h2>
            </Link>
            <h2 className="text-xl font-mono text-purple-400">{room.roomId}</h2>
            <p className="text-sm text-gray-400 mt-2">Language: {room.language}</p>
            {/* We can add a 'Join' button and 'Delete' icon here */}
          </div>
        ))}
        
        {userRooms.length === 0 && (
          <p className="text-gray-500">You haven't created any rooms yet.</p>
        )}
      </div>
    </div>
  );
}