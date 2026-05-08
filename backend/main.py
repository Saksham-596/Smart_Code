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
@app.websocket("/ws/{room_name}")
async def code_collaboration_ws(websocket: WebSocket, room_name: str):
    await manager.connect(websocket, room_name)
    try:
        while True:
            # y-websocket communicates exclusively in binary
            data = await websocket.receive_bytes()
            await manager.broadcast(data, websocket, room_name)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_name)
    except Exception:
        # Catch any unexpected drops safely
        manager.disconnect(websocket, room_name)