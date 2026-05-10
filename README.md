# ⚡ SmartCode: Real-Time Collaborative IDE & Execution Engine

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=nextdotjs)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)
![Celery](https://img.shields.io/badge/celery-%2337814A.svg?style=for-the-badge&logo=celery&logoColor=white)
![AWS EC2](https://img.shields.io/badge/AWS_EC2-232F3E?style=for-the-badge&logo=amazon-aws&logoColor=white)
![Yjs](https://img.shields.io/badge/Yjs-CRDT-blue?style=for-the-badge)

**SmartCode** is a distributed, real-time code editor and execution environment. Built to handle concurrent multi-user typing without desyncs, it leverages Conflict-Free Replicated Data Types (CRDTs) over continuous WebSocket tunnels, backed by a decoupled, asynchronous cloud execution engine.

🔗 **[Live Production Application](https://smart-code-lovat.vercel.app/)** ## 🏗️ System Architecture

SmartCode utilizes a highly decoupled, microservice-inspired architecture to separate the UI, the WebSocket sync relay, and the dangerous payload of executing raw user code.

* **The Gateway (Frontend):** Hosted on Vercel, utilizing the Next.js App Router. It manages user sessions securely using NextAuth (Auth.js) with Google OAuth, storing persistent data in MongoDB Atlas.
* **The Proxy (Nginx):** Raw TCP traffic is routed through an Nginx reverse proxy on an **AWS EC2** instance. Nginx handles SSL termination and translates external HTTPS/WSS requests to internal ports.
* **The API & Sync Relay (FastAPI):** A high-concurrency server running on Uvicorn (ASGI). It manages the real-time Yjs WebSocket connections for document synchronization and acts as the entry point for code execution requests.
* **The Message Broker (Redis):** Acts as the high-speed, in-memory queue. Instead of FastAPI executing code directly, it pushes the payload to Redis.
* **The Execution Workers (Celery):** Background worker processes consume tasks from the Redis queue, safely execute the user's C++/Python code in an isolated environment, enforce timeout limits, and return the output without blocking the main web server.

## 🛠️ Hardcore Engineering Challenges Conquered

### 1. Asynchronous Code Execution (Preventing Server Lockups)
If a user submits an infinite loop (`while(True): pass`), it would normally freeze the ASGI event loop and crash the WebSocket server. 
* **The Fix:** Implemented **Celery** and **Redis**. Code execution requests are offloaded to background worker nodes. FastAPI immediately returns a task ID to the frontend, which then polls for the result. This completely decouples the web server from the execution environment, guaranteeing 100% API uptime even during malicious or heavy code execution.

### 2. Conflict-Free State Sync (Yjs vs OT)
To handle two users typing on the exact same line at the exact same millisecond, legacy Operational Transformation (OT) was bypassed in favor of **Yjs (CRDTs)**. This mathematically guarantees eventual consistency across all clients without a centralized locking mechanism.

### 3. React 18 Strict Mode Memory Leaks
React's double-mounting lifecycle in development and dynamic routing caused duplicated WebSocket connections. This was mitigated by:
* Storing the Yjs Document and WebSocket Provider securely inside `useRef` hooks rather than `useState`.
* Implementing native `window.addEventListener('beforeunload')` explicit cleanup functions to gracefully sever WebSocket connections and prevent server-side memory leaks.

### 4. Persistent Cloud Tunnels & Process Daemonization
WebSockets require persistent TCP connections. The backend infrastructure was optimized by:
* Configuring strict **Nginx timeout rules** to keep WSS connections alive during extended coding sessions while preventing dropped packets.
* Utilizing **Tmux** for process daemonization on the Linux server, keeping FastAPI, Redis, and the Celery workers running silently in the background independently of SSH sessions.

## 💻 Tech Stack Overview

* **Frontend:** Next.js 14, React, Tailwind CSS, Monaco Editor
* **Backend:** FastAPI, Python, WebSockets, Uvicorn (ASGI)
* **Message Queue & Workers:** Redis, Celery
* **State & Sync:** Yjs (CRDT), NextAuth.js (Google Provider)
* **Database & Infra:** MongoDB Atlas, AWS EC2 (Ubuntu), Nginx

## 🚀 Local Deployment

### 1. Start the Distributed Execution Engine (Backend)
You will need three separate terminal windows to run the backend microservices.

**Terminal A (Start Redis):**
```bash
# Ensure Redis is installed and running on default port 6379
redis-server
cd smartcode-backend
source venv/bin/activate
celery -A worker_file_name worker --loglevel=info 
```

**Terminal B (Start the Celery Worker):**
```bash
cd smartcode-backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
``` 
**Terminal C (Start FastAPI Server):**
```bash 
cd smartcode-backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```
**Start the Client (Frontend)**
```bash
git clone [https://github.com/Saksham-596/Smart_Code.git](https://github.com/Saksham-596/Smart_Code.git)
npm install --legacy-peer-deps
npm run dev

