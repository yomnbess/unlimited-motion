import { useState, useRef, useCallback } from 'react'
import './App.css'

const ASPECTS = ['16:9', '9:16', '1:1']
const DURATIONS = [5, 10]

function FilmIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6" cy="7.5" r="0.8" fill="currentColor" />
      <circle cx="6" cy="12" r="0.8" fill="currentColor" />
      <circle cx="6" cy="16.5" r="0.8" fill="currentColor" />
      <circle cx="18" cy="7.5" r="0.8" fill="currentColor" />
      <circle cx="18" cy="12" r="0.8" fill="currentColor" />
      <circle cx="18" cy="16.5" r="0.8" fill="currentColor" />
    </svg>
  )
}

export default function App() {
  const [apiKey, setApiKey] = useState('')
  const [mode, setMode] = useState('text') // 'text' | 'image'
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [aspect, setAspect] = useState('16:9')
  const [duration, setDuration] = useState(5)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState('idle') // idle | submitting | polling | done | error
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [resultUrl, setResultUrl] = useState(null)
  const [history, setHistory] = useState([])
  const fileInputRef = useRef(null)

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target.result)
    reader.readAsDataURL(file)
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    handleFile(file)
  }, [handleFile])

  const canGenerate = apiKey.trim().length > 0 &&
    (mode === 'text' ? prompt.trim().length > 0 : imageFile !== null)

  async function handleGenerate() {
    if (!canGenerate) return
    setStatus('submitting')
    setErrorMsg('')
    setResultUrl(null)
    setProgress(0)

    try {
      // The real Kling API key lives server-side (KLING_API_KEY in Vercel
      // env vars), never in the browser. This calls our own backend, which
      // calls Kling. Until that env var is configured on the deployed
      // project, /api/generate returns a clear "not configured" error and
      // we fall back to the demo flow below.
      const submitRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          prompt,
          negativePrompt,
          aspectRatio: aspect,
          duration,
          imageBase64: mode === 'image' ? imagePreview : undefined,
        }),
      })

      if (!submitRes.ok) {
        const errData = await submitRes.json().catch(() => ({}))
        throw new Error(errData.error || 'Could not reach the generation backend.')
      }

      const { taskId } = await submitRes.json()
      setStatus('polling')

      const videoUrl = await pollForResult(taskId, mode, setProgress)

      const result = {
        id: Date.now(),
        prompt: mode === 'text' ? prompt : '(image-to-video)',
        mode,
        aspect,
        duration,
        thumb: imagePreview || null,
        videoUrl,
        createdAt: new Date().toLocaleTimeString(),
      }
      setHistory((h) => [result, ...h])
      setResultUrl(videoUrl)
      setStatus('done')
    } catch (err) {
      // Backend not configured yet (e.g. running locally, or the Kling key
      // hasn't been added in Vercel) — fall back to the demo render so the
      // UI still works while things are being set up.
      if (String(err.message || '').includes('not configured')) {
        await simulateGeneration(setStatus, setProgress)
        const placeholderResult = {
          id: Date.now(),
          prompt: mode === 'text' ? prompt : '(image-to-video)',
          mode,
          aspect,
          duration,
          thumb: imagePreview || null,
          createdAt: new Date().toLocaleTimeString(),
        }
        setHistory((h) => [placeholderResult, ...h])
        setResultUrl('demo')
        setStatus('done')
        return
      }
      setErrorMsg(err.message || 'Generation failed. Check your API key and try again.')
      setStatus('error')
    }
  }

  function resetForm() {
    setPrompt('')
    setNegativePrompt('')
    setImageFile(null)
    setImagePreview(null)
    setResultUrl(null)
    setStatus('idle')
    setProgress(0)
  }

  return (
    <div className="app">
      <div className="grain" />
      <header className="header">
        <div className="brand">
          <FilmIcon />
          <span className="brand-name">Unlimited Motion</span>
        </div>
        <div className="header-meta">
          <span className="reel-counter">REEL {String(history.length).padStart(3, '0')}</span>
        </div>
      </header>

      <main className="layout">
        <section className="panel control-panel">
          <div className="panel-label">
            <span className="eyebrow">01 — SOURCE</span>
          </div>

          <div className="mode-switch" role="tablist" aria-label="Generation mode">
            <button
              role="tab"
              aria-selected={mode === 'text'}
              className={`mode-tab ${mode === 'text' ? 'active' : ''}`}
              onClick={() => setMode('text')}
            >
              Text → Video
            </button>
            <button
              role="tab"
              aria-selected={mode === 'image'}
              className={`mode-tab ${mode === 'image' ? 'active' : ''}`}
              onClick={() => setMode('image')}
            >
              Image → Video
            </button>
          </div>

          {mode === 'text' ? (
            <div className="field">
              <label htmlFor="prompt">Describe the shot</label>
              <textarea
                id="prompt"
                placeholder="A slow dolly-in through fog toward a lit doorway, 35mm film grain, dusk..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
              />
            </div>
          ) : (
            <div className="field">
              <label>Source frame</label>
              <div
                className={`dropzone ${isDragging ? 'dragging' : ''} ${imagePreview ? 'has-image' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Source frame preview" className="preview-img" />
                ) : (
                  <div className="dropzone-empty">
                    <span className="dropzone-icon">+</span>
                    <span>Drop a frame, or click to browse</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </div>
              <textarea
                placeholder="Optional motion notes — what should happen in the frame..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="motion-notes"
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="negative">Exclude (optional)</label>
            <input
              id="negative"
              type="text"
              placeholder="blur, watermark, distortion..."
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Aspect</label>
              <div className="chip-row">
                {ASPECTS.map((a) => (
                  <button
                    key={a}
                    className={`chip ${aspect === a ? 'active' : ''}`}
                    onClick={() => setAspect(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Duration</label>
              <div className="chip-row">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    className={`chip ${duration === d ? 'active' : ''}`}
                    onClick={() => setDuration(d)}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="panel-label panel-label-spaced">
            <span className="eyebrow">02 — ACCESS</span>
          </div>
          <div className="field">
            <label htmlFor="apikey">Kling AI API key</label>
            <input
              id="apikey"
              type="password"
              placeholder="Paste your key — stored only in this session"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <span className="hint">Your key never leaves your browser except to call Kling directly.</span>
          </div>

          <button
            className="generate-btn"
            disabled={!canGenerate || status === 'submitting' || status === 'polling'}
            onClick={handleGenerate}
          >
            {status === 'submitting' || status === 'polling' ? 'Rolling…' : 'Generate'}
          </button>

          {status === 'error' && (
            <div className="error-box">{errorMsg}</div>
          )}
        </section>

        <section className="panel preview-panel">
          <div className="panel-label">
            <span className="eyebrow">03 — DAILIES</span>
          </div>

          <div className="preview-stage">
            {status === 'idle' && (
              <div className="stage-empty">
                <FilmIcon />
                <p>Your render will surface here.</p>
              </div>
            )}
            {(status === 'submitting' || status === 'polling') && (
              <div className="stage-loading">
                <div className="sprocket-track">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <span key={i} className="sprocket" style={{ animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
                <p>{status === 'submitting' ? 'Sending to Kling…' : `Developing — ${progress}%`}</p>
              </div>
            )}
            {status === 'done' && (
              <div className="stage-done">
                {resultUrl && resultUrl !== 'demo' ? (
                  <div className="demo-frame">
                    <video src={resultUrl} controls autoPlay loop className="result-video" />
                  </div>
                ) : (
                  <div className="demo-frame">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Generated result preview" />
                    ) : (
                      <div className="demo-placeholder">
                        <FilmIcon />
                      </div>
                    )}
                    <span className="demo-badge">DEMO RENDER</span>
                  </div>
                )}
                {(!resultUrl || resultUrl === 'demo') && (
                  <p className="stage-note">
                    This is a placeholder preview. Add your Kling AI key to the server (KLING_API_KEY) to render real clips.
                  </p>
                )}
                <button className="ghost-btn" onClick={resetForm}>Start a new reel</button>
              </div>
            )}
          </div>

          {history.length > 0 && (
            <div className="filmstrip">
              <span className="eyebrow filmstrip-label">SESSION HISTORY</span>
              <div className="filmstrip-track">
                {history.map((h) => (
                  <div key={h.id} className="filmstrip-frame" title={h.prompt}>
                    {h.thumb ? <img src={h.thumb} alt="" /> : <div className="frame-blank" />}
                    <span className="frame-meta">{h.createdAt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <span>Unlimited Motion — bring your own Kling AI key</span>
      </footer>
    </div>
  )
}

function pollForResult(taskId, mode, setProgress) {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const maxAttempts = 60 // ~5 minutes at 5s intervals

    const interval = setInterval(async () => {
      attempts += 1
      // Nudge the progress bar forward visually while we wait for real status
      setProgress((p) => Math.min(p + 4, 92))

      try {
        const res = await fetch(`/api/status?taskId=${encodeURIComponent(taskId)}&mode=${mode}`)
        const data = await res.json()

        if (!res.ok) {
          clearInterval(interval)
          reject(new Error(data.error || 'Status check failed.'))
          return
        }

        if (data.status === 'succeed' && data.videoUrl) {
          clearInterval(interval)
          setProgress(100)
          resolve(data.videoUrl)
        } else if (data.status === 'failed') {
          clearInterval(interval)
          reject(new Error('Kling AI failed to generate this video.'))
        } else if (attempts >= maxAttempts) {
          clearInterval(interval)
          reject(new Error('Generation timed out. Check Kling AI dashboard for the task status.'))
        }
      } catch (err) {
        clearInterval(interval)
        reject(new Error('Lost connection while checking generation status.'))
      }
    }, 5000)
  })
}

function simulateGeneration(setStatus, setProgress) {
  return new Promise((resolve) => {
    setStatus('polling')
    let p = 0
    const interval = setInterval(() => {
      p += Math.floor(Math.random() * 18) + 7
      if (p >= 100) {
        p = 100
        setProgress(p)
        clearInterval(interval)
        setTimeout(resolve, 300)
      } else {
        setProgress(p)
      }
    }, 350)
  })
}
