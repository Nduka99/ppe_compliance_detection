# PPE Compliance Detector — Frontend

React web application for uploading construction site images and videos to detect PPE compliance. Communicates with a Gradio backend hosted on Hugging Face Spaces.

**Live:** [ppe-detection-blush.vercel.app](https://ppe-detection-blush.vercel.app)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 |
| Build | Vite 8 |
| Styling | Tailwind CSS 4 |
| Backend client | @gradio/client 2.1 |
| Deployment | Vercel |

## Features

- **Image upload** — Drag-and-drop or file picker for JPG/PNG images
- **Video upload** — Upload clips of up to 15 seconds. The whole file is sent to the backend, which
  returns a single **annotated MP4** with detections drawn on every frame, plus an aggregate
  compliance report. The result is playable inline and downloadable. (Earlier versions sliced frames
  in the browser and showed a frame-by-frame navigator; that was replaced because a video output is
  what the task actually calls for.)
- **Detection sensitivity slider** — Adjustable from 0.1 (more detections) to 0.9 (higher confidence), default 0.25
- **Detection results** — Annotated image with bounding boxes and class labels drawn by the backend model
- **Compliance summary** — Structured breakdown of violations and compliant PPE items with friendly labels ("Missing hard hat") and per-detection confidence
- **Video frame navigator** — Browse individual frame results with previous/next buttons and an aggregated summary across all frames
- **Dark mode** — Toggle between light and dark themes, persisted in localStorage and respects system preference
- **Backend auto-wake** — The status badge (Connecting / Waking backend / Online / Offline) polls the Hugging Face runtime API; a sleeping Space is woken automatically and a Retry action appears if the backend is unreachable
- **Example image** — "Try an example image" link for quick demo without uploading

## Architecture

```
User uploads image/video
        │
        ▼
  ┌─────────────┐
  │ ImageUpload  │  Validates file type, video duration (max 10s)
  └──────┬──────┘
         │
   Image: send directly
   Video: extract frames at 2 FPS via <canvas> + <video>
         │
         ▼
  ┌─────────────┐
  │   api.js     │  @gradio/client → HF Spaces /detect endpoint
  └──────┬──────┘  (wakes a sleeping Space via the HF runtime API first)
         │
         ▼
  ┌─────────────────┐
  │ DetectionResult  │  Displays annotated image from backend
  │ ComplianceSummary│  Renders the structured JSON report
  └─────────────────┘
```

## Components

| Component | Purpose |
|-----------|---------|
| `App.jsx` | Main application logic, state management, video frame extraction, layout |
| `api.js` | Gradio client connection, backend wake/health lifecycle, `detectPPE()`, error mapping |
| `labels.js` | Maps raw class names to user-facing labels ("no-hardhat" → "Missing hard hat") |
| `ImageUpload.jsx` | File drag-and-drop, image/video type detection, video duration validation |
| `DetectionResult.jsx` | Annotated image display with loading state |
| `ComplianceSummary.jsx` | Structured violation/compliant lists with confidence, text fallback |
| `StatusBadge.jsx` | Backend connectivity indicator with retry action |
| `ThemeToggle.jsx` | Dark/light mode toggle |

## Video Processing Flow

1. User uploads a video file (max 10 seconds enforced in browser)
2. A hidden `<video>` element loads the file
3. Frames are extracted at 2 FPS by seeking through the video and drawing each frame to a `<canvas>`
4. Each frame is converted to a blob and sent as a standard image to the `/detect` endpoint
5. A progress bar updates as each frame completes
6. Results are displayed in a frame navigator with previous/next controls
7. An aggregated compliance summary counts violation frames vs. compliant frames

For a 10-second video at 2 FPS, this produces ~20 frames and ~20 sequential API calls.

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn

### Install & Run

```bash
cd frontend
npm install
cp .env.example .env    # or create .env with VITE_SPACE_ID
npm run dev
```

The app opens at `http://localhost:5173`.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_SPACE_ID` | Yes | — | Hugging Face Space ID (e.g. `nduka1999/PPE`) |

### Build for Production

```bash
npm run build    # Output in dist/
npm run preview  # Preview production build locally
```

## Deployment

Deployed on Vercel with automatic deploys from the `main` branch. The `frontend/` directory is set as the root directory in Vercel project settings.

The `VITE_SPACE_ID` environment variable must be configured in Vercel's project settings to point to the Hugging Face Space backend.

## Theming

CSS custom properties in `index.css` define the colour scheme:

| Token | Light | Dark |
|-------|-------|------|
| `--bg-primary` | `#ffffff` | `#0f172a` |
| `--bg-card` | `#ffffff` | `#1e293b` |
| `--text-primary` | `#0f172a` | `#f1f5f9` |
| `--accent` | `#ea580c` | `#f97316` |
| `--success` | `#16a34a` | `#22c55e` |
| `--danger` | `#dc2626` | `#ef4444` |
