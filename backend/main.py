from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from ypy_websocket import WebsocketServer
import asyncio  # <-- NEW: Needed to run background tasks

app = FastAPI()

# 1. CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Initialize the Yjs CRDT Engine
yjs_server = WebsocketServer()

# --- NEW: Tell the engine to actually start running in the background ---
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(yjs_server.start())

@app.get("/")
async def home():
    return {"message": "Smart_Code Engine is Online"}

# 3. Real-time synchronization tunnel
@app.websocket("/ws/{room_name}")
async def code_collaboration_ws(websocket: WebSocket, room_name: str):
    await websocket.accept()
    # Hand connection over to the Yjs server
    await yjs_server.serve(websocket)