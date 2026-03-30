import { useCallback, useRef, useState } from "react";

export default function ImageUpload({ preview, onImageSelect, onVideoSelect, onClear }) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [videoError, setVideoError] = useState(null);

  const handleFile = useCallback(
    (file) => {
      if (!file) return;
      setVideoError(null);

      if (file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        onImageSelect(file, url);
        return;
      }

      if (file.type.startsWith("video/")) {
        const url = URL.createObjectURL(file);
        // Validate duration via a temporary video element
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          URL.revokeObjectURL(video.src);
          if (video.duration > 10) {
            setVideoError(`Video is ${Math.round(video.duration)}s — max 10 seconds allowed.`);
            URL.revokeObjectURL(url);
            return;
          }
          onVideoSelect(file, url, video.duration);
        };
        video.onerror = () => {
          setVideoError("Could not read video file.");
          URL.revokeObjectURL(url);
        };
        video.src = url;
        return;
      }
    },
    [onImageSelect, onVideoSelect]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      className={`rounded-xl border-2 border-dashed transition-all overflow-hidden ${
        dragOver ? "border-orange-500 scale-[1.01]" : ""
      }`}
      style={{
        borderColor: dragOver ? "var(--accent)" : "var(--border)",
        backgroundColor: "var(--bg-card)",
      }}
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
            <video
              src={preview.url}
              className="w-full max-h-80 object-contain"
              controls
              muted
            />
          ) : (
            <img
              src={preview.url || preview}
              alt="Uploaded"
              className="w-full max-h-80 object-contain"
            />
          )}
          <button
            onClick={() => { setVideoError(null); onClear(); }}
            className="absolute top-2 right-2 p-1.5 rounded-full text-white bg-black/60 hover:bg-black/80 transition"
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
          className="w-full p-12 flex flex-col items-center gap-3 cursor-pointer"
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ color: "var(--text-secondary)" }}
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
            Drop an image or video here, or click to upload
          </p>
          <p className="text-xs" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
            JPG, PNG, MP4, WebM — videos max 10 seconds
          </p>
        </button>
      )}

      {videoError && (
        <div className="px-4 py-2 text-sm" style={{ color: "var(--danger)" }}>
          {videoError}
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
