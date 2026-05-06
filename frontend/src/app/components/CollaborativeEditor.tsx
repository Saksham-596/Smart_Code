'use client'

import React, {useEffect,useRef} from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import {MonacoBinding} from 'y-monaco';

export default function CollaborativeEditor({
  roomName, 
  onCodeChange 
}: { 
  roomName: string; 
  onCodeChange?: (newCode: string) => void 
}) {
    const editorRef = useRef<any>(null);
    function handleEditorDidMount(editor: any ,monaco : any) {
        editorRef.current = editor;
        //intialize CRDT state
        const ydoc = new Y.Doc();
        // connect to FastAPI websocket 
        const provider = new WebsocketProvider(
              'ws://localhost:8000',
              `ws/${roomName}`,
              ydoc
        );
        
        // create shared text type
        const ytext = ydoc.getText('monaco');
        // bind the editor to the CRDT state
        const binding = new MonacoBinding(
            ytext, 
            editorRef.current.getModel(),
            new Set([editorRef.current]),
            provider.awareness
        );
        return ()=>{
            binding.destroy();
            provider.disconnect();
            ydoc.destroy();
        };
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
          // Send the updated code back to page.tsx
          if (onCodeChange && value !== undefined) {
             onCodeChange(value);
          }
        }}
      />
        </div>
    );
}
