'use client'

import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

export default function CollaborativeEditor({
  roomName, 
  onCodeChange 
}: { 
  roomName: string; 
  onCodeChange?: (newCode: string) => void 
}) {
    const editorRef = useRef<any>(null);
    
    // We use refs to store the Yjs instances so we can clean them up properly when you leave the room
    const ydocRef = useRef<Y.Doc | null>(null);
    const providerRef = useRef<WebsocketProvider | null>(null);
    const bindingRef = useRef<MonacoBinding | null>(null);

    // Handle proper cleanup to prevent phantom WebSockets and memory leaks
    useEffect(() => {
        return () => {
            if (bindingRef.current) bindingRef.current.destroy();
            if (providerRef.current) providerRef.current.disconnect();
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
                // (Meaning nobody else is in the room to sync with us via WebRTC)
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
                defaultLanguage="python"
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                }}
                onMount={handleEditorDidMount}
                onChange={(value) => {
                  // Send the updated code back to page.tsx for Auto-Save
                  if (onCodeChange && value !== undefined) {
                     onCodeChange(value);
                  }
                }}
            />
        </div>
    );
}