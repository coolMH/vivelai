# PixelCraft AI Image Studio 🎨✨

Full-Stack AI Image Editing Web Application built with **React**, **TypeScript**, **Tailwind CSS**, and **Python FastAPI** / **Express** powered by Google Gemini AI (`@google/genai`).

## 🌟 Key Features

1. **AI Watermark Remover**:
   - Upload any image with text, logos, timestamps, or stock stamps.
   - **Auto-Detect**: AI identifies watermark coordinates and bounding regions automatically.
   - **Manual Canvas Brush**: Interactive mask editor with adjustable brush size, zoom, and clear/eraser tools.
   - **AI Inpainting**: Smoothly replaces watermark areas using Gemini vision models with seamless texture fill.

2. **Background Remover**:
   - Separate dedicated page for instant background removal.
   - Isolates subjects and generates transparent PNG output.
   - Live background replacement options (Transparent Checkerboard, Solid Color, Gradient, Custom Image).

3. **Image Resize**:
   - Custom target Width & Height input fields.
   - "Maintain Aspect Ratio" toggle with automatic ratio recalculation.
   - Quick preset resolutions (1080p, 4K, Instagram Square, YouTube Thumbnail, etc.).

4. **Image Quality Enhancer**:
   - 2x / 4x resolution upscaling with detail recovery.
   - Adjustable sharpness slider, contrast boost, and denoise filters.
   - Interactive Before/After split comparison slider.

5. **Bulk Processing Tools**:
   - Upload multiple images at once via drag & drop.
   - Process batch operations simultaneously (Bulk Background Removal, Bulk Resizing, Bulk Quality Enhancement, Bulk Watermark Removal).
   - Export all processed results in a single **ZIP archive**.

---

## 🚀 Local Development Setup

### Environment Variables
Copy `.env.example` to `.env` and fill in your Gemini API key:
```env
GEMINI_API_KEY="your_gemini_api_key_here"
```

### Running with Node Express Backend (AI Studio Container)
```bash
npm install
npm run dev
```
Access at `http://localhost:3000`.

### Running with Python FastAPI Backend
```bash
# Install Python dependencies
pip install -r requirements.txt

# Start Python FastAPI server
uvicorn main:app --reload --port 3000
```

---

## 📦 Deploying to GitHub & Render

### Step 1: Push to GitHub
1. Create a new repository on GitHub.
2. Commit and push your code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of PixelCraft AI Image Studio"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/pixelcraft-ai-studio.git
   git push -u origin main
   ```

### Step 2: Deploy on Render
1. Log in to [Render](https://render.com/).
2. Click **New +** -> **Blueprint**.
3. Connect your GitHub repository (`pixelcraft-ai-studio`).
4. Render will read `render.yaml` automatically.
5. In **Environment Variables**, add:
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
6. Click **Apply**. Render will build the React frontend and launch the Python FastAPI backend!
