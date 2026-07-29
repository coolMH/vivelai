"""
PixelCraft AI Image Studio - Python FastAPI Backend
Entry point for Render / FastAPI production deployment
"""

import os
import re
import base64
import json
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from google import genai
from google.genai import types

app = FastAPI(
    title="PixelCraft AI Image Studio API",
    description="Python FastAPI backend for AI image editing, watermark removal, background removal, resizing, and enhancement",
    version="1.0.0"
)

# Enable CORS for all origins in development and production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper function to get GoogleGenAI client
def get_ai_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY environment variable is not configured."
        )
    return genai.Client(
        api_key=api_key,
        http_options={'headers': {'User-Agent': 'aistudio-build'}}
    )

def parse_base64_image(image_data: str):
    match = re.match(r"^data:(image/\w+);base64,(.+)$", image_data)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid base64 image data format")
    mime_type = match.group(1)
    base64_str = match.group(2)
    image_bytes = base64.b64decode(base64_str)
    return mime_type, base64_str, image_bytes

# Data Models
class DetectWatermarkRequest(BaseModel):
    image: str

class InpaintWatermarkRequest(BaseModel):
    image: str
    mask: Optional[str] = None
    prompt: Optional[str] = None

class RemoveBackgroundRequest(BaseModel):
    image: str

class EnhanceImageRequest(BaseModel):
    image: str
    scale: Optional[int] = 2
    sharpness: Optional[int] = 50

# API Endpoints
@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "PixelCraft Python FastAPI Backend",
        "hasApiKey": bool(os.getenv("GEMINI_API_KEY"))
    }

@app.post("/api/watermark/detect")
def detect_watermark(payload: DetectWatermarkRequest):
    try:
        mime_type, base64_str, _ = parse_base64_image(payload.image)
        ai = get_ai_client()

        prompt = """Analyze this image carefully to detect any watermarks, logos, text overlays, copyright text, semi-transparent marks, stock photo stamps, or timestamps.
Return a JSON object listing whether any watermark is found and an array of bounding regions normalized from 0 to 100 percentage coordinates.
Format:
{
  "watermarksFound": true,
  "regions": [
    {
      "x": 10,
      "y": 10,
      "width": 30,
      "height": 15,
      "description": "Stock photo mark at top left",
      "confidence": 0.95
    }
  ]
}"""

        response = ai.models.generate_content(
            model="gemini-3.6-flash",
            contents=[
                types.Part.from_bytes(data=base64.b64decode(base64_str), mime_type=mime_type),
                prompt
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            )
        )

        text = response.text or "{}"
        data = json.loads(text)

        return {
            "success": True,
            "watermarksFound": data.get("watermarksFound", False),
            "regions": data.get("regions", [])
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e), "watermarksFound": False, "regions": []}
        )

@app.post("/api/watermark/inpaint")
def inpaint_watermark(payload: InpaintWatermarkRequest):
    try:
        mime_type, base64_str, _ = parse_base64_image(payload.image)
        ai = get_ai_client()

        parts = [
            types.Part.from_bytes(data=base64.b64decode(base64_str), mime_type=mime_type)
        ]

        if payload.mask:
            mask_mime, mask_base64, _ = parse_base64_image(payload.mask)
            parts.append(types.Part.from_bytes(data=base64.b64decode(mask_base64), mime_type=mask_mime))

        parts.append(payload.prompt or "Remove the watermark area from this image and inpaint smoothly preserving details.")

        response = ai.models.generate_content(
            model="gemini-3.1-flash-lite-image",
            contents=parts
        )

        result_image = None
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    b64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                    result_image = f"data:{part.inline_data.mime_type or 'image/png'};base64,{b64}"
                    break

        if not result_image:
            return {"success": False, "message": "No output image generated. Client fallback recommended.", "fallbackNeeded": True}

        return {"success": True, "resultImage": result_image}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e), "fallbackNeeded": True}
        )

@app.post("/api/background/remove")
def remove_background(payload: RemoveBackgroundRequest):
    try:
        mime_type, base64_str, _ = parse_base64_image(payload.image)
        ai = get_ai_client()

        response = ai.models.generate_content(
            model="gemini-3.1-flash-lite-image",
            contents=[
                types.Part.from_bytes(data=base64.b64decode(base64_str), mime_type=mime_type),
                "Remove the background of this image completely and return a clean subject cutout with transparent background PNG."
            ]
        )

        result_image = None
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    b64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                    result_image = f"data:{part.inline_data.mime_type or 'image/png'};base64,{b64}"
                    break

        if not result_image:
            return {"success": False, "message": "Client fallback recommended.", "fallbackNeeded": True}

        return {"success": True, "resultImage": result_image}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e), "fallbackNeeded": True}
        )

@app.post("/api/enhance")
def enhance_image(payload: EnhanceImageRequest):
    try:
        mime_type, base64_str, _ = parse_base64_image(payload.image)
        ai = get_ai_client()

        response = ai.models.generate_content(
            model="gemini-3.1-flash-lite-image",
            contents=[
                types.Part.from_bytes(data=base64.b64decode(base64_str), mime_type=mime_type),
                f"Enhance image quality, sharpen details, remove blur and upscale by {payload.scale}x."
            ]
        )

        result_image = None
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    b64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                    result_image = f"data:{part.inline_data.mime_type or 'image/png'};base64,{b64}"
                    break

        if not result_image:
            return {"success": False, "message": "Client fallback recommended.", "fallbackNeeded": True}

        return {"success": True, "resultImage": result_image}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e), "fallbackNeeded": True}
        )

# Serve static frontend dist directory if present
if os.path.exists("dist"):
    app.mount("/", StaticFiles(directory="dist", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
