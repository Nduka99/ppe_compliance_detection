import { useCallback, useRef, useState } from "react";
import { MAX_VIDEO_SECONDS } from "../config";

export default function ImageUpload({ preview, onImageSelect, onVideoSelect, onClear }) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState(null);

  const handleFile = useCallback(
    (file) => {
      if (!file) return;
      setFileError(null);

      if (file.type.startsWith("image/")) {
        onImageSelect(file, URL.createObjectURL(file));
        return;
      }

      if (file.type.startsWith("video/")) {
        const url = URL.createObjectURL(file);
        // Validate duration via a temporary video element
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          URL.revokeObjectURL(video.src);
          if (!Number.isFinite(video.duration)) {
            setFileError("Could not determine the video's length. Try re-exporting it as MP4.");
            URL.revokeObjectURL(url);
            return;
          }
          if (video.duration > MAX_VIDEO_SECONDS) {
            setFileError(
              `Video is ${Math.round(video.duration)}s — the maximum is ${MAX_VIDEO_SECONDS} seconds.`
            );
            URL.revokeObjectURL(url);
            return;
          }
          onVideoSelect(file, url);
        };
        video.onerror = () => {
          setFileError("Could not read the video file.");
          URL.revokeObjectURL(url);
        };
        video.src = url;
        return;
      }

      setFileError("Unsupported file type — upload a JPG or PNG image, or an MP4/WebM video.");
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
            <video src={preview.url} className="max-h-80 w-full object-contain" controls muted />
          ) : (
            <img src={preview.url} alt="Uploaded" className="max-h-80 w-full object-contain" />
          )}
          <button
            onClick={() => {
              setFileError(null);
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
