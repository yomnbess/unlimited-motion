// /api/status.js
//
// Polls Kling AI for the status of a previously submitted task.
// Frontend calls this every few seconds with ?taskId=...&mode=text|image
// until status is "succeed" or "failed".

const KLING_BASE_URL = 'https://api-singapore.klingai.com';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.KLING_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is not configured with a Kling API key yet.' });
  }

  const { taskId, mode } = req.query;
  if (!taskId) {
    return res.status(400).json({ error: 'taskId query param is required' });
  }

  const endpoint = mode === 'image'
    ? `${KLING_BASE_URL}/v1/videos/image2video/${taskId}`
    : `${KLING_BASE_URL}/v1/videos/text2video/${taskId}`;

  try {
    const klingRes = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await klingRes.json();

    if (!klingRes.ok) {
      return res.status(klingRes.status).json({
        error: data?.message || 'Could not fetch task status.',
        details: data,
      });
    }

    const status = data?.data?.task_status; // submitted | processing | succeed | failed
    const videoUrl = data?.data?.task_result?.videos?.[0]?.url || null;

    return res.status(200).json({ status, videoUrl, raw: data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach Kling AI.', details: String(err) });
  }
}
