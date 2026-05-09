'use client'

import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

// Helper to generate vibrant cursor colors
const cursorColors = ['#FF5F58', '#FFBD2E', '#28C840', '#9E54FF', '#00C2FF', '#FF2E93'];
function getRandomColor() {
  return cursorColors[Math.floor(Math.random() * cursorColors.length)];
}

export default function CollaborativeEditor({
  roomName, 
  language,
  onCodeChange,
  userName,
  userImage,
  onUsersChange 
}: { 
  roomName: string; 
  language: string;
  onCodeChange?: (newCode: string) => void;
  userName: string;
  userImage?: string | null;
  onUsersChange?: (users: any[]) => void; 
}) {
    const editorRef = useRef<any>(null);
    
    // We use refs to store the Yjs instances so we can clean them up properly
    const ydocRef = useRef<Y.Doc | null>(null);
    const providerRef = useRef<WebsocketProvider | null>(null);
    const bindingRef = useRef<MonacoBinding | null>(null);

    // Handle proper cleanup on component unmount
    // Handle proper cleanup on component unmount AND browser refresh
    useEffect(() => {
        const killConnection = () => {
            if (providerRef.current) {
                // Erase our avatar and kill the socket before leaving
                providerRef.current.awareness.setLocalState(null);
                providerRef.current.disconnect();
            }
        };

        // This catches browser native Reload and Tab Close events
        window.addEventListener('beforeunload', killConnection);

        return () => {
            window.removeEventListener('beforeunload', killConnection);
            killConnection(); // This catches standard React unmounts
            if (bindingRef.current) bindingRef.current.destroy();
            if (ydocRef.current) ydocRef.current.destroy();
        };
    }, []);
    function handleEditorDidMount(editor: any, monaco: any) {
        editorRef.current = editor;
        
        // --- REACT STRICT MODE GHOST BUSTER ---
        // If React double-mounts the editor, kill the old connections before making new ones
        if (providerRef.current) {
            providerRef.current.disconnect();
        }
        if (bindingRef.current) bindingRef.current.destroy();
        if (ydocRef.current) ydocRef.current.destroy();

        // Initialize CRDT state
        const ydoc = new Y.Doc();
        ydocRef.current = ydoc;

        // Grab the API URL from your Vercel env variable (fallback to localhost for local dev)
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

        // Dynamically convert http:// to ws:// OR https:// to wss://
        const wsUrl = apiUrl.replace(/^http/, "ws");

        // Connect to FastAPI secure websocket 
        const provider = new WebsocketProvider(
            wsUrl,
            `ws/${roomName}`,
            ydoc
        );
        providerRef.current = provider;

        // --- AWARENESS CODE ---
        // 1. Tell everyone else who we are and what our color is
        const myColor = getRandomColor();
        provider.awareness.setLocalStateField('user', {
            name: userName,
            color: myColor,
            image: userImage
        });

        // 2. Listen for changes in who is connected
        provider.awareness.on('change', () => {
            if (onUsersChange) {
                // Get all active users
                const states = Array.from(provider.awareness.getStates().values());
                
                // Filter out any empty states and map to just the user data
                const activeUsers = states
                    .filter(state => state.user)
                    .map(state => state.user);
                    
                onUsersChange(activeUsers);
            }
        });
        
        // Create shared text type
        const ytext = ydoc.getText('monaco');
        
        // Bind the editor to the CRDT state
        const binding = new MonacoBinding(
            ytext, 
            editorRef.current.getModel(),
            new Set([editorRef.current]),
            provider.awareness
        );
        bindingRef.current = binding;

        // --- FETCH SAVED CODE FROM MONGODB ---
        // --- FETCH SAVED CODE FROM MONGODB ---
        const fetchSavedCode = async () => {
            try {
                const res = await fetch(`/api/room/${roomName}`);
                if (!res.ok) return;

                const data = await res.json();
                
                if (data.code && ytext.toString() === '') {
                    ytext.insert(0, data.code);
                }
            } catch (error) {
                console.error("Failed to load saved room data:", error);
            }
        };

        // Wait 1.5 seconds to let the WebSocket handshake complete
        setTimeout(() => {
            // Count how many clients are actively connected to this room
            const activeClients = Array.from(provider.awareness.getStates().keys());
            
            // CRITICAL: If we are the ONLY person in the room (length <= 1), inject the DB code.
            // If length > 1, someone else (or a ghost) is already here holding the CRDT state, 
            // so we do nothing and let Yjs automatically sync the code from them.
            if (activeClients.length <= 1) {
                fetchSavedCode();
            }
        }, 1500);
    }

    return (
        <div className="h-full w-full">
            <Editor
                height="100%"
                defaultLanguage={language}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                }}
                onMount={handleEditorDidMount}
                onChange={(value) => {
                  if (onCodeChange && value !== undefined) {
                     onCodeChange(value);
                  }
                }}
            />
        </div>
    );
}