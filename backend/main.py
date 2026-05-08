from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from ypy_websocket import WebsocketServer

app = FastAPI()

# 1. CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Initialize the Yjs CRDT Engine (No background task needed!)
yjs_server = WebsocketServer()

@app.get("/")
async def home():
    return {"message": "Smart_Code WebSocket Engine is Online"}

# 3. Real-time synchronization tunnel
@app.websocket("/ws/{room_name}")
async def code_collaboration_ws(websocket: WebSocket, room_name: str):
    await websocket.accept()
    try:
        # ypy-websocket automatically parses the URL to group users into the correct room
        await yjs_server.serve(websocket)
    except WebSocketDisconnect:
        # Gracefully handle users closing their browser tabs
        pass