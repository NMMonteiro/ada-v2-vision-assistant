import os
import asyncio
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

class AdaAgent:
    def __init__(self):
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"), http_options={'api_version': 'v1alpha'})
        self.model_id = "gemini-2.0-flash-exp"
        self.session = None

    async def connect(self):
        config = {"registration_ids": ["vision", "audio"]} # Simplified for placeholder
        async with self.client.aio.live.connect(model=self.model_id, config=config) as session:
            self.session = session
            async for message in session:
                yield message

    async def send_frame(self, frame_data):
        if self.session:
            await self.session.send(input=types.LiveClientRealtimeInput(
                media_chunks=[types.Blob(data=frame_data, mime_type="image/jpeg")]
            ))

# Logic for object detection and gesture processing will go here
