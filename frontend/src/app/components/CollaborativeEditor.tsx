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

    // Handle proper cleanup to prevent phantom WebSockets and memory leaks
    useEffect(() => {
        return () => {
            // CRITICAL FIX: Erase our avatar from everyone else's screen before leaving!
            if (providerRef.current) {
                providerRef.current.awareness.setLocalState(null);
                providerRef.current.disconnect();
            }
            if (bindingRef.current) bindingRef.current.destroy();
            if (ydocRef.current) ydocRef.current.destroy();
        };
    }, []);

    function handleEditorDidMount(editor: any, monaco: any) {
        editorRef.current = editor;
        
        // Initialize CRDT state
        const ydoc = new Y.Doc();
        ydocRef.current = ydoc;

        // Connect to FastAPI websocket 
        const provider = new WebsocketProvider(
              'ws://localhost:8000',
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
        const fetchSavedCode = async () => {
            try {
                const res = await fetch(`/api/room/${roomName}`);
                if (!res.ok) return;

                const data = await res.json();
                
                // ONLY insert if the yjs document is completely empty
                if (data.code && ytext.toString() === '') {
                    ytext.insert(0, data.code);
                }
            } catch (error) {
                console.error("Failed to load saved room data:", error);
            }
        };

        // Wait 500ms to allow WebSocket to sync with any existing users first
        setTimeout(() => {
            fetchSavedCode();
        }, 500);
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