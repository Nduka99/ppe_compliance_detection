import { useCallback, useRef, useState } from "react";
import { MAX_VIDEO_SECONDS } from "../config";

function formatSize(bytes) {
  if (!bytes) return null;
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`;
}

/** Shown when the browser cannot render the clip — analysis still works. */
function ClipPlaceholder({ preview }) {
  const details = [preview.name, formatSize(preview.size),
                   preview.duration ? `${preview.duration.toFixed(1)}s` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-10 text-center">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.5" className="text-ink-muted" aria-hidden="true">
        <rect x="2" y="5" width="14" height="14" rx="2" />
        <path d="M16 10l6-3v10l-6-3z" />
      </svg>
      <p className="font-medium">Clip ready to analyze</p>
      {details && <p className="text-xs text-ink-muted">{details}</p>}
      <p className="max-w-xs text-xs text-ink-muted">
        Your browser can't play this format, so there's no preview — but it will still be
        analyzed, and the annotated result will play here.
      </p>
    </div>
  );
}

export default function ImageUpload({ preview, onImageSelect, onVideoSelect, onClear }) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState(null);
  // Some containers/codecs (HEVC, .mov, .avi) parse well enough to report a
  // duration but the browser still refuses to render them. The server can
  // decode far more than the browser can play, so a failed preview must not
  // block analysis — we fall back to a file summary instead.
  const [previewUnplayable, setPreviewUnplayable] = useState(false);

  const handleFile = useCallback(
    (file) => {
      if (!file) return;
      setFileError(null);
      setPreviewUnplayable(false);

      if (file.type.startsWith("image/")) {
        onImageSelect(file, URL.createObjectURL(file));
        return;
      }

      if (file.type.startsWith("video/")) {
        const url = URL.createObjectURL(file);
        // Read duration via a temporary element before accepting the file
        const probe = document.createElement("video");
        probe.preload = "metadata";
        probe.onloadedmetadata = () => {
          const duration = probe.duration;
          URL.revokeObjectURL(probe.src);
          if (!Number.isFinite(duration)) {
            setFileError("Could not determine the video's length. Try re-exporting it as MP4.");
            URL.revokeObjectURL(url);
            return;
          }
          if (duration > MAX_VIDEO_SECONDS) {
            setFileError(
              `Video is ${Math.round(duration)}s — the maximum is ${MAX_VIDEO_SECONDS} seconds.`
            );
            URL.revokeObjectURL(url);
            return;
          }
          onVideoSelect(file, url, duration);
        };
        probe.onerror = () => {
          // Metadata unreadable in-browser. Accept anyway: the server decodes
          // formats the browser cannot, and rejecting here would block valid files.
          onVideoSelect(file, url, null);
          setPreviewUnplayable(true);
        };
        probe.src = url;
        return;
      }

      setFileError("Unsupported file type — upload a JPG or PNG image, or a video file.");
    },
    [onImageSelect, onVideoSelect]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      handleFile(e.dataTransfer.files[0]);
    },
    [handleFile]
  );

  return (
    <div
      className={`overflow-hidden rounded-xl border-2 border-dashed bg-card transition-all ${
        dragOver ? "scale-[1.01] border-accent" : "border-line"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {preview ? (
        <div className="relative">
          {preview.isVideo ? (
            previewUnplayable ? (
              <ClipPlaceholder preview={preview} />
            ) : (
              <video
                src={preview.url}
                className="max-h-80 w-full object-contain"
                controls
                muted
                onError={() => setPreviewUnplayable(true)}
              />
            )
          ) : (
            <img src={preview.url} alt="Uploaded" className="max-h-80 w-full object-contain" />
          )}
          <button
            onClick={() => {
              setFileError(null);
              setPreviewUnplayable(false);
              onClear();
            }}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80"
            aria-label="Remove file"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full cursor-pointer flex-col items-center gap-3 p-12"
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-ink-muted"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="font-medium text-ink-muted">
            Drop an image or video here, or click to upload
          </p>
          <p className="text-xs text-ink-muted opacity-70">
            JPG, PNG, MP4, WebM — videos up to {MAX_VIDEO_SECONDS} seconds
          </p>
        </button>
      )}

      {fileError && (
        <div className="px-4 py-2 text-sm text-danger" role="alert">
          {fileError}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />
    </div>
  );
}
