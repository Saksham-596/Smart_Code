'use client'

import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

// Helper to generate vibrant cursor colors for the IDE aesthetic
const cursorColors = ['#f43f5e', '#f59e0b', '#10b981', '#8b5cf6', '#0ea5e9', '#ec4899'];
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
    const ydocRef = useRef<Y.Doc | null>(null);
    const providerRef = useRef<WebsocketProvider | null>(null);
    const bindingRef = useRef<MonacoBinding | null>(null);

    useEffect(() => {
        const killConnection = () => {
            if (providerRef.current) {
                providerRef.current.awareness.setLocalState(null);
                providerRef.current.disconnect();
            }
        };

        window.addEventListener('beforeunload', killConnection);

        return () => {
            window.removeEventListener('beforeunload', killConnection);
            killConnection(); 
            if (bindingRef.current) bindingRef.current.destroy();
            if (ydocRef.current) ydocRef.current.destroy();
        };
    }, []);

    function handleEditorDidMount(editor: any, monaco: any) {
        editorRef.current = editor;
        
        // --- REACT STRICT MODE GHOST BUSTER ---
        if (providerRef.current) providerRef.current.disconnect();
        if (bindingRef.current) bindingRef.current.destroy();
        if (ydocRef.current) ydocRef.current.destroy();

        // Custom Premium Dark Theme for Monaco
        monaco.editor.defineTheme('smartcode-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
                'editor.background': '#0e0e11',
                'editor.lineHighlightBackground': '#18181b',
                'editorLineNumber.foreground': '#52525b',
                'editorIndentGuide.background': '#27272a',
            }
        });
        monaco.editor.setTheme('smartcode-dark');

        const ydoc = new Y.Doc();
        ydocRef.current = ydoc;

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const wsUrl = apiUrl.replace(/^http/, "ws");

        const provider = new WebsocketProvider(
            wsUrl,
            `ws/${roomName}`,
            ydoc
        );
        providerRef.current = provider;

        const myColor = getRandomColor();
        provider.awareness.setLocalStateField('user', {
            name: userName,
            color: myColor,
            image: userImage
        });

        provider.awareness.on('change', () => {
            if (onUsersChange) {
                const states = Array.from(provider.awareness.getStates().values());
                const activeUsers = states
                    .filter(state => state.user)
                    .map(state => state.user);
                onUsersChange(activeUsers);
            }
        });
        
        const ytext = ydoc.getText('monaco');
        
        const binding = new MonacoBinding(
            ytext, 
            editorRef.current.getModel(),
            new Set([editorRef.current]),
            provider.awareness
        );
        bindingRef.current = binding;

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

        setTimeout(() => {
            const activeClients = Array.from(provider.awareness.getStates().keys());
            if (activeClients.length <= 1) {
                fetchSavedCode();
            }
        }, 1500);
    }

    return (
        <div className="h-full w-full absolute inset-0">
            <Editor
                height="100%"
                defaultLanguage={language}
                theme="smartcode-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  padding: { top: 20 },
                  cursorBlinking: "smooth",
                  smoothScrolling: true,
                  contextmenu: false,
                  renderLineHighlight: "all",
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