import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Helper to get GoogleGenAI instance safely
function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ----------------------------------------------------------------------
// 1. Healthcheck Endpoint
// ----------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'PixelCraft AI Image Studio API',
    hasApiKey: !!process.env.GEMINI_API_KEY,
  });
});

// ----------------------------------------------------------------------
// 2. AI Watermark Detection Endpoint
// ----------------------------------------------------------------------
app.post('/api/watermark/detect', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, message: 'Image base64 string is required' });
    }

    // Extract base64 and mime
    const matches = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ success: false, message: 'Invalid image base64 format' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    const ai = getAIClient();

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
          {
            text: `Analyze this image carefully to detect any watermarks, logos, text overlays, copyright text, semi-transparent marks, stock photo stamps, or timestamps.
Return a JSON object listing whether any watermark is found and an array of bounding regions normalized from 0 to 100 percentage coordinates.
Format:
{
  "watermarksFound": boolean,
  "regions": [
    {
      "x": number, // left percentage 0-100
      "y": number, // top percentage 0-100
      "width": number, // width percentage 0-100
      "height": number, // height percentage 0-100
      "description": string, // brief name e.g. "Stock Photo Stamp at bottom right"
      "confidence": number // 0.0 to 1.0
    }
  ]
}`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            watermarksFound: { type: Type.BOOLEAN },
            regions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  width: { type: Type.NUMBER },
                  height: { type: Type.NUMBER },
                  description: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                },
                required: ['x', 'y', 'width', 'height', 'description'],
              },
            },
          },
          required: ['watermarksFound', 'regions'],
        },
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);

    return res.json({
      success: true,
      watermarksFound: parsed.watermarksFound || false,
      regions: parsed.regions || [],
    });
  } catch (error: any) {
    console.error('Watermark detection error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to detect watermark',
      watermarksFound: false,
      regions: [],
    });
  }
});

// ----------------------------------------------------------------------
// 3. AI Watermark Inpainting Endpoint
// ----------------------------------------------------------------------
app.post('/api/watermark/inpaint', async (req, res) => {
  try {
    const { image, mask, prompt } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, message: 'Image base64 string is required' });
    }

    const matches = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ success: false, message: 'Invalid image base64 format' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    const ai = getAIClient();

    const parts: any[] = [
      {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      },
    ];

    if (mask) {
      const maskMatches = mask.match(/^data:(image\/\w+);base64,(.+)$/);
      if (maskMatches) {
        parts.push({
          inlineData: {
            data: maskMatches[2],
            mimeType: maskMatches[1],
          },
        });
      }
    }

    parts.push({
      text: prompt || 'Remove the watermark and transparent text marks from this image. Inpaint the marked area smoothly to seamlessly blend with the surrounding texture and background.',
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: { parts },
    });

    let resultImage: string | null = null;
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          resultImage = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!resultImage) {
      return res.status(200).json({
        success: false,
        message: 'AI Model returned text or no output image. Falling back to high-fidelity client inpaint.',
        fallbackNeeded: true,
      });
    }

    return res.json({
      success: true,
      resultImage,
    });
  } catch (error: any) {
    console.error('Inpaint error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to perform AI inpainting',
      fallbackNeeded: true,
    });
  }
});

// ----------------------------------------------------------------------
// 4. Background Removal Endpoint
// ----------------------------------------------------------------------
app.post('/api/background/remove', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, message: 'Image base64 is required' });
    }

    const matches = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ success: false, message: 'Invalid image format' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    const ai = getAIClient();

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
          {
            text: 'Isolate the main subject in this image and remove the background entirely. Return a cutout of the main subject with a transparent PNG background.',
          },
        ],
      },
    });

    let resultImage: string | null = null;
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          resultImage = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!resultImage) {
      return res.json({
        success: false,
        message: 'Falling back to client background removal filter.',
        fallbackNeeded: true,
      });
    }

    return res.json({
      success: true,
      resultImage,
    });
  } catch (error: any) {
    console.error('Background removal error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error processing background removal',
      fallbackNeeded: true,
    });
  }
});

// ----------------------------------------------------------------------
// 5. Image Quality Enhancer Endpoint
// ----------------------------------------------------------------------
app.post('/api/enhance', async (req, res) => {
  try {
    const { image, scale = 2, sharpness = 50 } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, message: 'Image is required' });
    }

    const matches = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ success: false, message: 'Invalid image format' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    const ai = getAIClient();

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
          {
            text: `Enhance the resolution and clarity of this image. Improve sharpness, restore fine details, fix noise, and output a high-definition upscaled version. Scale factor: ${scale}x.`,
          },
        ],
      },
    });

    let resultImage: string | null = null;
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          resultImage = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!resultImage) {
      return res.json({
        success: false,
        message: 'Using client-side high definition enhancement pipeline.',
        fallbackNeeded: true,
      });
    }

    return res.json({
      success: true,
      resultImage,
    });
  } catch (error: any) {
    console.error('Enhance error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Enhancement error',
      fallbackNeeded: true,
    });
  }
});

// ----------------------------------------------------------------------
// 6. Vite / Express Server Initialization
// ----------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PixelCraft AI Image Studio Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
