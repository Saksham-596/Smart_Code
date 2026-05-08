import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb'; 
import { getServerSession } from "next-auth"; 
import { authOptions } from "../../auth/[...nextauth]/route";

// --- SAVE CODE TO DATABASE (Auto-save) ---
export async function POST(
  request: Request, 
  { params }: { params: any }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.email; 
        const resolvedParams = await params;
        const roomId = resolvedParams?.roomId;

        if (!roomId) return NextResponse.json({ error: "Missing roomId" }, { status: 400 });

        const { code, language } = await request.json();
        const client = await clientPromise;
        const db = client.db('smartcode_db');

        await db.collection('rooms').updateOne(
            { roomId: roomId },
            { 
                $set: { code, language, lastUpdated: new Date() },
                $setOnInsert: { creatorId: userId }
            },
            { upsert: true }
        );

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: "Server Error", message: error.message }, { status: 500 });
    }
}

// --- FETCH CODE FROM DATABASE (Join Room) ---
export async function GET(
    request: Request, 
    { params }: { params: any }
  ) {
      try {
          const resolvedParams = await params;
          const roomId = resolvedParams?.roomId;
  
          if (!roomId) return NextResponse.json({ error: "Missing roomId" }, { status: 400 });
  
          const client = await clientPromise;
          const db = client.db('smartcode_db');
  
          const room = await db.collection('rooms').findOne({ roomId: roomId });
  
          if (!room) {
              return NextResponse.json({ error: "Room not found" }, { status: 404 });
          }
  
          return NextResponse.json(room);
      } catch (error: any) {
          return NextResponse.json({ error: "Server Error", message: error.message }, { status: 500 });
      }
  }

  // --- DELETE ROOM ---
export async function DELETE(
    request: Request, 
    { params }: { params: any }
  ) {
      try {
          const session = await getServerSession(authOptions);
          
          // 1. Must be logged in
          if (!session || !session.user) {
              return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
          }
  
          const resolvedParams = await params;
          const roomId = resolvedParams?.roomId;
  
          if (!roomId) return NextResponse.json({ error: "Missing roomId" }, { status: 400 });
  
          const client = await clientPromise;
          const db = client.db('smartcode_db');
  
          // 2. Security Check: Only delete if the logged-in user actually created this room
          const result = await db.collection('rooms').deleteOne({ 
              roomId: roomId,
              creatorId: session.user.email 
          });
  
          if (result.deletedCount === 0) {
              return NextResponse.json({ error: "Room not found or unauthorized to delete" }, { status: 403 });
          }
  
          return NextResponse.json({ success: true });
      } catch (error: any) {
          return NextResponse.json({ error: "Server Error", message: error.message }, { status: 500 });
      }
  }