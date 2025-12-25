import os
import asyncio
import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

@sio.event
async def connect(sid, environ):
    print(f"Neural Link Established: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Neural Link Severed: {sid}")

@sio.event
async def vision_frame(sid, data):
    # This will receive frames from the frontend MediaPipe tracking
    # and pass them to the Gemini Live session in ada.py
    pass

@sio.event
async def voice_input(sid, data):
    # Audio streaming handling
    pass

if __name__ == "__main__":
    uvicorn.run(socket_app, host="0.0.0.0", port=8000)
