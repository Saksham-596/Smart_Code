from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# 1. CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Custom Connection Manager (The Dumb Relay)
class RoomManager:
    def __init__(self):
        # Maps room IDs to a list of connected WebSockets
        self.rooms: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_name: str):
        await websocket.accept()
        if room_name not in self.rooms:
            self.rooms[room_name] = []
        self.rooms[room_name].append(websocket)

    def disconnect(self, websocket: WebSocket, room_name: str):
        if room_name in self.rooms:
            if websocket in self.rooms[room_name]:
                self.rooms[room_name].remove(websocket)
            # Delete the room from memory if everyone leaves
            if not self.rooms[room_name]:
                del self.rooms[room_name]

    async def broadcast(self, message: bytes, sender: WebSocket, room_name: str):
        if room_name in self.rooms:
            for connection in self.rooms[room_name]:
                # Send the Yjs binary packet to everyone EXCEPT the person who typed it
                if connection != sender:
                    try:
                        await connection.send_bytes(message)
                    except Exception:
                        pass

manager = RoomManager()

@app.get("/")
async def home():
    return {"message": "Smart_Code Custom Relay is Online"}

# 3. The WebSocket Tunnel
# The ':path' tells FastAPI to capture everything after /ws/
@app.websocket("/ws/{room_name:path}")
async def code_collaboration_ws(websocket: WebSocket, room_name: str):
    # If the room name accidentally comes in with a trailing slash, strip it
    clean_room_name = room_name.strip("/")
    
    await manager.connect(websocket, clean_room_name)
    try:
        while True:
            data = await websocket.receive_bytes()
            await manager.broadcast(data, websocket, clean_room_name)
    except WebSocketDisconnect:
        manager.disconnect(websocket, clean_room_name)
    except Exception:
        manager.disconnect(websocket, clean_room_name)