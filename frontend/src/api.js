import { Client } from "@gradio/client";

const SPACE_ID = import.meta.env.VITE_SPACE_ID;
const SPACE_API_URL = `https://huggingface.co/api/spaces/${SPACE_ID}`;
const SPACE_HOST = `https://${SPACE_ID.replace("/", "-").toLowerCase()}.hf.space`;

let clientPromise = null;

export function connectToBackend() {
  if (!clientPromise) {
    clientPromise = Client.connect(SPACE_ID).catch((err) => {
      clientPromise = null; // allow a later retry instead of caching the failure
      throw err;
    });
  }
  return clientPromise;
}

async function getSpaceStage() {
  const res = await fetch(SPACE_API_URL);
  if (!res.ok) throw new Error(`Space lookup failed (HTTP ${res.status})`);
  const info = await res.json();
  return info?.runtime?.stage ?? "UNKNOWN";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Bring the backend to a usable state, reporting progress via onStatus with
 * one of: "connecting", "waking", "ready", "offline".
 *
 * Free-tier Spaces sleep after inactivity; a sleeping Space needs a request
 * to start rebuilding and takes a minute or two to come back.
 */
export async function ensureBackendReady(onStatus) {
  onStatus("connecting");
  try {
    // If the HF API is unreachable we still attempt a direct connection.
    let stage = await getSpaceStage().catch(() => "UNKNOWN");

    if (stage !== "RUNNING" && stage !== "UNKNOWN") {
      onStatus("waking");
      // Any request to the Space host wakes it. The response is opaque
      // (no CORS) — only the request itself matters.
      fetch(SPACE_HOST, { mode: "no-cors" }).catch(() => {});

      const deadline = Date.now() + 4 * 60 * 1000;
      while (Date.now() < deadline && stage !== "RUNNING") {
        await sleep(8000);
        stage = await getSpaceStage().catch(() => stage);
      }
    }

    await connectToBackend();
    onStatus("ready");
  } catch (err) {
    console.error("Backend unavailable:", err);
    onStatus("offline");
  }
}

export async function detectPPE(imageBlob, confThreshold = 0.25) {
  const client = await connectToBackend();
  const result = await client.predict("/detect", {
    image: imageBlob,
    conf_threshold: confThreshold,
  });
  const [annotated, summary, report] = result.data;
  return {
    annotatedUrl:
      annotated?.url ?? (typeof annotated === "string" ? annotated : null),
    report: normalizeReport(report, summary),
  };
}

/**
 * Shape the backend's structured report for the UI. Falls back to the text
 * summary if the backend predates the JSON output.
 */
function normalizeReport(report, summary) {
  if (report && Array.isArray(report.violations)) {
    return {
      violations: report.violations,
      compliant: report.compliant ?? [],
      workers: report.workers ?? null,
      totalDetections: report.total_detections ?? null,
      hasViolations: report.violations.length > 0,
      rawSummary: null,
    };
  }
  const text = typeof summary === "string" ? summary : "";
  return {
    violations: [],
    compliant: [],
    workers: null,
    totalDetections: null,
    hasViolations: text.includes("VIOLATION"),
    rawSummary: text || null,
  };
}

export function describeError(err) {
  const message = String(err?.message ?? err ?? "");
  if (/sleep|paused|building|starting|connect|fetch/i.test(message)) {
    return "The detection service is starting up. Give it a minute, then try again.";
  }
  if (/queue|429|too many/i.test(message)) {
    return "The service is busy right now. Please try again shortly.";
  }
  return "Detection failed. Please try again.";
}
