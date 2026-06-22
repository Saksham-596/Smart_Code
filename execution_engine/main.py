from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

# Import our worker and celery_app
from worker import execute_code_task, celery_app

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CodePayload(BaseModel):
    language: str
    code: str
    stdin: str = ""

@app.post("/execute")
async def submit_code(payload: CodePayload):
    task = execute_code_task.delay(payload.language, payload.code,payload.stdin)
    return {"job_id": task.id, "status": "processing"}

@app.get("/status/{job_id}")
async def get_status(job_id: str):
    # Retrieve the state directly from our app instance
    task_result = celery_app.AsyncResult(job_id)
    
    if task_result.state == 'PENDING':
        return {"status": "processing"}
    elif task_result.state == 'SUCCESS':
        return {"status": "completed", "result": task_result.result}
    elif task_result.state == 'FAILURE':
        return {"status": "failed", "error": str(task_result.info)}
    else:
        return {"status": task_result.state}
# ==========================================
# MULTIPLAYER WEBSOCKET RELAY (FUSED)
# ==========================================

class RoomManager:
    def __init__(self):
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
            if not self.rooms[room_name]:
                del self.rooms[room_name]

    async def broadcast(self, message: bytes, sender: WebSocket, room_name: str):
        if room_name in self.rooms:
            for connection in self.rooms[room_name]:
                if connection != sender:
                    try:
                        await connection.send_bytes(message)
                    except Exception:
                        pass

manager = RoomManager()

@app.websocket("/ws/{room_name:path}")
async def code_collaboration_ws(websocket: WebSocket, room_name: str):
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