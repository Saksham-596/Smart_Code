import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';
import { auth } from '@clerk/nextjs/server';

export async function POST(
  request: Request, 
  { params }: { params: any }
) {
    try {
        //console.log("--- DEBUG START: POST API HIT ---");

        // 1. Diagnose Clerk Auth
        let authResult;
        try {
            authResult = await auth();
        } catch (authErr: any) {
            return NextResponse.json({ 
                error: "CRITICAL: Clerk Auth Failed", 
                message: authErr.message,
                stack: authErr.stack 
            }, { status: 500 });
        }

        const { userId } = authResult;
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized: No Clerk userId found" }, { status: 401 });
        }

        // 2. Diagnose Dynamic Parameters
        let resolvedParams;
        try {
            resolvedParams = await params;
        } catch (paramErr) {
            resolvedParams = params; // Fallback for older Next.js versions
        }
        const roomId = resolvedParams?.roomId;

        if (!roomId) {
            return NextResponse.json({ error: "Bad Request: Missing roomId in URL" }, { status: 400 });
        }

        // 3. Diagnose Request Body
        let body;
        try {
            body = await request.json();
        } catch (bodyErr: any) {
            return NextResponse.json({ 
                error: "Bad Request: Invalid JSON in request body", 
                message: bodyErr.message 
            }, { status: 400 });
        }
        const { code, language } = body;

        // 4. Diagnose MongoDB Connection
        let client;
        try {
            client = await clientPromise;
        } catch (dbConnectErr: any) {
            return NextResponse.json({ 
                error: "CRITICAL: MongoDB Connection Failed", 
                message: dbConnectErr.message,
                stack: dbConnectErr.stack 
            }, { status: 500 });
        }

        // 5. Diagnose MongoDB Write Operation
        try {
            const db = client.db('smartcode_db');
            await db.collection('rooms').updateOne(
                { roomId: roomId },
                { 
                    $set: { 
                        code, 
                        language,
                        lastUpdated: new Date()
                    },
                    $setOnInsert: { creatorId: userId }
                },
                { upsert: true }
            );
        } catch (dbWriteErr: any) {
            return NextResponse.json({ 
                error: "CRITICAL: MongoDB Write Failed", 
                message: dbWriteErr.message,
                stack: dbWriteErr.stack 
            }, { status: 500 });
        }

        //console.log("--- DEBUG SUCCESS: Saved successfully! ---");
        return NextResponse.json({ success: true });

    } catch (globalErr: any) {
        return NextResponse.json({ 
            error: "CRITICAL: Global Route Failure", 
            message: globalErr.message,
            stack: globalErr.stack 
        }, { status: 500 });
    }
}

// Keep your GET route exactly as it is below this line...