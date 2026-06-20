// /api/generate.js
//
// Submits a text-to-video or image-to-video job to Kling AI.
// The Kling API key lives only in Vercel's environment variables
// (set under Project Settings -> Environment Variables as KLING_API_KEY),
// never in the browser.
//
// The frontend calls this endpoint, this endpoint calls Kling, and the
// task_id comes back to the browser, which then polls /api/status.

const KLING_BASE_URL = 'https://api-singapore.klingai.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.KLING_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Server is not configured with a Kling API key yet. Add KLING_API_KEY in Vercel project settings.',
    });
  }

  const { mode, prompt, negativePrompt, aspectRatio, duration, imageBase64 } = req.body || {};

  if (mode !== 'text' && mode !== 'image') {
    return res.status(400).json({ error: 'mode must be "text" or "image"' });
  }
  if (mode === 'text' && (!prompt || !prompt.trim())) {
    return res.status(400).json({ error: 'prompt is required for text-to-video' });
  }
  if (mode === 'image' && !imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required for image-to-video' });
  }

  const endpoint = mode === 'text'
    ? `${KLING_BASE_URL}/v1/videos/text2video`
    : `${KLING_BASE_URL}/v1/videos/image2video`;

  const payload = {
    model_name: 'kling-v1',
    prompt: prompt || '',
    negative_prompt: negativePrompt || '',
    aspect_ratio: aspectRatio || '16:9',
    duration: String(duration || 5),
    mode: 'std',
  };

  if (mode === 'image') {
    // Kling expects a base64 string without the data URL prefix
    payload.image = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  }

  try {
    const klingRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await klingRes.json();

    if (!klingRes.ok) {
      return res.status(klingRes.status).json({
        error: data?.message || 'Kling AI rejected the request.',
        details: data,
      });
    }

    // Kling returns the task id nested under data.task_id in most regions
    const taskId = data?.data?.task_id || data?.task_id;
    if (!taskId) {
      return res.status(502).json({ error: 'Kling AI did not return a task id.', details: data });
    }

    return res.status(200).json({ taskId, mode });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach Kling AI.', details: String(err) });
  }
}
