import { Client } from "@gradio/client";

const SPACE_ID = import.meta.env.VITE_SPACE_ID;
let clientInstance = null;

export async function connectToBackend() {
  if (!clientInstance) {
    clientInstance = await Client.connect(SPACE_ID);
  }
  return clientInstance;
}

export async function detectPPE(imageBlob, confThreshold = 0.25) {
  const client = await connectToBackend();
  const result = await client.predict("/detect", {
    image: imageBlob,
    conf_threshold: confThreshold,
  });
  return result.data;
}

export async function checkHealth() {
  try {
    await connectToBackend();
    return true;
  } catch {
    return false;
  }
}
