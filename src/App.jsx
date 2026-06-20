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

function emptyProfile() {
  return {
    id: Date.now(),
    name: '',
    visualIdentity: '',
    styleLock: '',
    lighting: '',
    wardrobe: '',
    anchorFrames: [],
  }
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

  // --- Character Passport integration ---
  const [profiles, setProfiles] = useState([])
  const [activeProfileId, setActiveProfileId] = useState(null)
  const [showProfilePanel, setShowProfilePanel] = useState(false)
  const [editingProfile, setEditingProfile] = useState(emptyProfile())
  const [lastVariableChanged, setLastVariableChanged] = useState(null)
  const [lastGenerationVariables, setLastGenerationVariables] = useState(null)
  const anchorInputRef = useRef(null)

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null

  function saveProfile() {
    if (!editingProfile.name.trim()) return
    setProfiles((prev) => {
      const exists = prev.find((p) => p.id === editingProfile.id)
      if (exists) {
        return prev.map((p) => (p.id === editingProfile.id ? editingProfile : p))
      }
      return [...prev, editingProfile]
    })
    setActiveProfileId(editingProfile.id)
    setShowProfilePanel(false)
  }

  function startNewProfile() {
    setEditingProfile(emptyProfile())
    setShowProfilePanel(true)
  }

  function editProfile(p) {
    setEditingProfile(p)
    setShowProfilePanel(true)
  }

  function handleAnchorUpload(file) {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      setEditingProfile((p) => ({
        ...p,
        anchorFrames: [...p.anchorFrames, e.target.result].slice(0, 4),
      }))
    }
    reader.readAsDataURL(file)
  }

  // Builds the locked prompt language string injected into every generation
  function buildLockedLanguage(profile) {
    if (!profile) return ''
    const parts = []
    if (profile.visualIdentity.trim()) parts.push(profile.visualIdentity.trim())
    if (profile.styleLock.trim()) parts.push(profile.styleLock.trim())
    if (profile.lighting.trim()) parts.push(`lighting: ${profile.lighting.trim()}`)
    if (profile.wardrobe.trim()) parts.push(`wearing ${profile.wardrobe.trim()}`)
    return parts.join(', ')
  }

  function detectChangedVariable(newScene) {
    // Scene Budget Rule: warn if more than one major variable changes
    // between this generation and the last successful one.
    if (!lastGenerationVariables) return null
    const current = { scene: newScene, aspect, duration, mode }
    const diffs = Object.keys(current).filter((k) => current[k] !== lastGenerationVariables[k])
    return diffs
  }


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

    // Character Passport: prepend locked visual/style/wardrobe language so
    // the user never has to retype it, and it can't be forgotten between
    // generations — the core failure mode the Passport system protects against.
    const lockedLanguage = buildLockedLanguage(activeProfile)
    const finalPrompt = lockedLanguage ? `${lockedLanguage}. ${prompt}` : prompt

    const changedVars = detectChangedVariable(finalPrompt)
    setLastVariableChanged(changedVars)

    try {
      const submitRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          prompt: finalPrompt,
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
        characterName: activeProfile?.name || null,
        createdAt: new Date().toLocaleTimeString(),
      }
      setHistory((h) => [result, ...h])
      setResultUrl(videoUrl)
      setStatus('done')
      setLastGenerationVariables({ scene: finalPrompt, aspect, duration, mode })
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
          characterName: activeProfile?.name || null,
          createdAt: new Date().toLocaleTimeString(),
        }
        setHistory((h) => [placeholderResult, ...h])
        setResultUrl('demo')
        setStatus('done')
        setLastGenerationVariables({ scene: finalPrompt, aspect, duration, mode })
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

      <section className="character-bar">
        <span className="eyebrow">CHARACTER PASSPORT</span>
        <div className="character-chips">
          <button
            className={`char-chip ${!activeProfileId ? 'active' : ''}`}
            onClick={() => setActiveProfileId(null)}
          >
            No profile
          </button>
          {profiles.map((p) => (
            <button
              key={p.id}
              className={`char-chip ${activeProfileId === p.id ? 'active' : ''}`}
              onClick={() => setActiveProfileId(p.id)}
              onDoubleClick={() => editProfile(p)}
              title="Double-click to edit"
            >
              {p.anchorFrames[0] && <img src={p.anchorFrames[0]} alt="" className="char-chip-thumb" />}
              {p.name}
            </button>
          ))}
          <button className="char-chip char-chip-add" onClick={startNewProfile}>
            + New character
          </button>
        </div>
        {activeProfile && (
          <p className="character-locked-note">
            Locked language active — injected into every generation until you switch or clear it.
          </p>
        )}
      </section>

      {showProfilePanel && (
        <div className="profile-overlay" onClick={() => setShowProfilePanel(false)}>
          <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
            <div className="profile-modal-header">
              <span className="eyebrow">CHARACTER PASSPORT — EDIT</span>
              <button className="close-btn" onClick={() => setShowProfilePanel(false)}>×</button>
            </div>

            <div className="field">
              <label>Character name</label>
              <input
                type="text"
                placeholder="e.g. Mira, Detective Cole..."
                value={editingProfile.name}
                onChange={(e) => setEditingProfile((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div className="field">
              <label>Visual identity block</label>
              <textarea
                placeholder="Structural language, not aesthetic — e.g. narrow jaw with defined angle, interpupillary distance ~40% of face width, hex #3a2418 skin tone with light freckling across nose bridge..."
                value={editingProfile.visualIdentity}
                onChange={(e) => setEditingProfile((p) => ({ ...p, visualIdentity: e.target.value }))}
                rows={4}
              />
            </div>

            <div className="field">
              <label>Style lock</label>
              <input
                type="text"
                placeholder="e.g. photorealistic, 35mm film grain, gritty documentary"
                value={editingProfile.styleLock}
                onChange={(e) => setEditingProfile((p) => ({ ...p, styleLock: e.target.value }))}
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label>Lighting signature</label>
                <input
                  type="text"
                  placeholder="e.g. soft window light from left"
                  value={editingProfile.lighting}
                  onChange={(e) => setEditingProfile((p) => ({ ...p, lighting: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Wardrobe anchor</label>
                <input
                  type="text"
                  placeholder="e.g. charcoal wool coat, brass buttons"
                  value={editingProfile.wardrobe}
                  onChange={(e) => setEditingProfile((p) => ({ ...p, wardrobe: e.target.value }))}
                />
              </div>
            </div>

            <div className="field">
              <label>Anchor frames ({editingProfile.anchorFrames.length}/4)</label>
              <div className="anchor-grid">
                {editingProfile.anchorFrames.map((src, i) => (
                  <div key={i} className="anchor-thumb">
                    <img src={src} alt={`Anchor ${i + 1}`} />
                    <button
                      className="anchor-remove"
                      onClick={() => setEditingProfile((p) => ({
                        ...p,
                        anchorFrames: p.anchorFrames.filter((_, idx) => idx !== i),
                      }))}
                    >×</button>
                  </div>
                ))}
                {editingProfile.anchorFrames.length < 4 && (
                  <div
                    className="anchor-thumb anchor-add"
                    onClick={() => anchorInputRef.current?.click()}
                  >
                    <span>+</span>
                    <input
                      ref={anchorInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => handleAnchorUpload(e.target.files?.[0])}
                    />
                  </div>
                )}
              </div>
              <span className="hint">Front-facing, three-quarter, profile, close-up — your visual source of truth.</span>
            </div>

            <div className="profile-modal-actions">
              <button className="ghost-btn" onClick={() => setShowProfilePanel(false)}>Cancel</button>
              <button
                className="generate-btn profile-save-btn"
                disabled={!editingProfile.name.trim()}
                onClick={saveProfile}
              >
                Save character
              </button>
            </div>
          </div>
        </div>
      )}

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

          {activeProfile && lastVariableChanged && lastVariableChanged.length > 1 && (
            <div className="budget-warning">
              ⚠ Scene Budget Rule: {lastVariableChanged.length} variables changed since your last generation. For best consistency, change one at a time.
            </div>
          )}

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
                    <span className="frame-meta">
                      {h.createdAt}
                      {h.characterName && <span className="frame-character"> · {h.characterName}</span>}
                    </span>
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
