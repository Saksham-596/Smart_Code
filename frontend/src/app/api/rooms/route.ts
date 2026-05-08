import { NextResponse } from 'next/server';
import clientPromise from '../../lib/mongodb';
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const client = await clientPromise;
        const db = client.db('smartcode_db');
        
        // Find all rooms created by this user, newest first
        const rooms = await db.collection('rooms')
            .find({ creatorId: session.user.email })
            .sort({ lastUpdated: -1 })
            .toArray();

        return NextResponse.json(rooms);
    } catch (error: any) {
        return NextResponse.json({ error: "Server Error", message: error.message }, { status: 500 });
    }
}