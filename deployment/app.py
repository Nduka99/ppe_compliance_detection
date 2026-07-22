"""PPE compliance detection API — Gradio app served on Hugging Face Spaces.

Two endpoints:
  /detect        image  -> annotated image + text summary + structured report
  /detect_video  video  -> annotated MP4 + text summary + structured report
"""

import json
import os
import tempfile

import cv2
import gradio as gr
import imageio.v2 as imageio
from PIL import Image
from ultralytics import YOLO

BASE_DIR = os.path.dirname(__file__)

with open(os.path.join(BASE_DIR, "model_config.json"), encoding="utf-8") as f:
    _config = json.load(f)

CLASS_NAMES = _config["class_names"]
VIOLATION_CLASSES = set(_config["violation_classes"])
COMPLIANT_CLASSES = set(_config["compliant_classes"])

model = YOLO(os.path.join(BASE_DIR, _config["model"]["file"]), task="detect")

EMPTY_REPORT = {"violations": [], "compliant": [], "workers": 0, "total_detections": 0}

# Video limits. Inference on the free CPU tier costs ~2-3 s per frame, so the
# model runs on a sampled subset of frames while every frame is still written
# out with the most recent boxes drawn on it — the result plays back smoothly
# at the source frame rate instead of looking like a slideshow.
MAX_VIDEO_SECONDS = 15
SAMPLE_FPS = 2
MAX_OUTPUT_WIDTH = 1280


# --------------------------------------------------------------------------- image


def detect_ppe(image, conf_threshold=0.25):
    """Detect PPE in an image and report compliance.

    Returns the annotated image, a human-readable summary, and a structured
    report for programmatic consumers (the web frontend).
    """
    if image is None:
        return None, "No image provided.", dict(EMPTY_REPORT)

    # PIL input lets Ultralytics handle the RGB->BGR conversion itself; feeding
    # a raw RGB ndarray would be misread as BGR and skew color-sensitive
    # classes (hi-vis vests especially).
    result = model.predict(image, imgsz=640, conf=conf_threshold, verbose=False)[0]

    # result.plot() returns a BGR array (OpenCV convention) — flip to RGB.
    annotated = Image.fromarray(result.plot()[..., ::-1])
    report = summarize(result)
    return annotated, build_summary(report), report


def summarize(result):
    """Turn one Ultralytics result into our structured report."""
    violations, compliant = [], []
    workers = 0
    for box in result.boxes:
        label = CLASS_NAMES[int(box.cls)]
        confidence = round(float(box.conf), 3)
        if label in VIOLATION_CLASSES:
            violations.append({"label": label, "confidence": confidence})
        elif label in COMPLIANT_CLASSES:
            compliant.append({"label": label, "confidence": confidence})
        elif label == "person":
            workers += 1
    return {
        "violations": violations,
        "compliant": compliant,
        "workers": workers,
        "total_detections": len(result.boxes),
    }


def build_summary(report):
    """Render the structured report as text for the Gradio demo page."""
    lines = []
    if report["violations"]:
        lines.append(f"⚠️ VIOLATIONS DETECTED ({len(report['violations'])}):")
        lines += [f"  ❌ {v['label']} ({v['confidence']:.0%})" for v in report["violations"]]
        lines.append("")
    else:
        lines.append("✅ No PPE violations detected.")
        lines.append("")

    if report["compliant"]:
        lines.append(f"PPE compliant items ({len(report['compliant'])}):")
        lines += [f"  ✅ {c['label']} ({c['confidence']:.0%})" for c in report["compliant"]]
        lines.append("")

    lines.append(f"Workers detected: {report['workers']}")
    lines.append(f"Total detections: {report['total_detections']}")
    return "\n".join(lines)


# --------------------------------------------------------------------------- video


def detect_ppe_video(video_path, conf_threshold=0.25):
    """Annotate a short video and report aggregate compliance.

    Returns the annotated MP4 path, a text summary, and a structured report.
    """
    empty = {
        "frames_analyzed": 0, "frames_with_violations": 0, "violation_counts": {},
        "compliant_counts": {}, "peak_workers": 0, "duration_seconds": 0.0,
    }
    if not video_path:
        return None, "No video provided.", empty

    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        return None, "Could not read that video file.", empty

    fps = capture.get(cv2.CAP_PROP_FPS) or 25.0
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = frame_count / fps if fps else 0.0

    if duration > MAX_VIDEO_SECONDS + 0.5:
        capture.release()
        return (None,
                f"Video is {duration:.0f}s — the maximum is {MAX_VIDEO_SECONDS} seconds.",
                empty)

    stride = max(1, round(fps / SAMPLE_FPS))
    out_path = os.path.join(tempfile.mkdtemp(), "ppe_annotated.mp4")
    # libx264 so the result plays in browsers; OpenCV's default mp4v does not.
    writer = imageio.get_writer(out_path, fps=fps, codec="libx264",
                                quality=7, macro_block_size=None)

    analyzed = 0
    frames_with_violations = 0
    violation_counts, compliant_counts = {}, {}
    peak_workers = 0
    last_result = None
    index = 0

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break

            if frame.shape[1] > MAX_OUTPUT_WIDTH:
                scale = MAX_OUTPUT_WIDTH / frame.shape[1]
                frame = cv2.resize(frame, (MAX_OUTPUT_WIDTH, int(frame.shape[0] * scale)))

            if index % stride == 0:
                # cv2 gives BGR, which is exactly what Ultralytics expects from
                # an ndarray — no conversion here (unlike the PIL image path).
                last_result = model.predict(frame, imgsz=640, conf=conf_threshold,
                                            verbose=False)[0]
                report = summarize(last_result)
                analyzed += 1
                if report["violations"]:
                    frames_with_violations += 1
                # Count each label once per frame, not once per box: these are
                # reported as "seen in N of M frames", so a frame containing
                # three hard hats must not push the share above 100%.
                for label in {v["label"] for v in report["violations"]}:
                    violation_counts[label] = violation_counts.get(label, 0) + 1
                for label in {c["label"] for c in report["compliant"]}:
                    compliant_counts[label] = compliant_counts.get(label, 0) + 1
                peak_workers = max(peak_workers, report["workers"])

            # Draw the most recent detections onto every frame so playback is
            # smooth rather than only updating twice a second.
            annotated = last_result.plot(img=frame) if last_result is not None else frame
            writer.append_data(annotated[..., ::-1])  # BGR -> RGB for the encoder
            index += 1
    finally:
        capture.release()
        writer.close()

    report = {
        "frames_analyzed": analyzed,
        "frames_with_violations": frames_with_violations,
        "violation_counts": violation_counts,
        "compliant_counts": compliant_counts,
        "peak_workers": peak_workers,
        "duration_seconds": round(duration, 2),
    }
    return out_path, build_video_summary(report), report


def build_video_summary(report):
    lines = []
    total = report["frames_analyzed"]
    flagged = report["frames_with_violations"]
    if flagged:
        lines.append(f"⚠️ VIOLATIONS DETECTED in {flagged} of {total} analyzed frames")
        lines.append("")
        for label, count in sorted(report["violation_counts"].items(), key=lambda kv: -kv[1]):
            lines.append(f"  ❌ {label} — seen in {count} frames")
    else:
        lines.append(f"✅ No PPE violations detected across {total} analyzed frames.")
    lines.append("")
    if report["compliant_counts"]:
        lines.append("PPE compliant items:")
        for label, count in sorted(report["compliant_counts"].items(), key=lambda kv: -kv[1]):
            lines.append(f"  ✅ {label} — seen in {count} frames")
        lines.append("")
    lines.append(f"Peak workers in frame: {report['peak_workers']}")
    lines.append(f"Clip length: {report['duration_seconds']:.1f}s")
    return "\n".join(lines)


# --------------------------------------------------------------------------- ui

example_dir = os.path.join(BASE_DIR, "examples")
examples = []
if os.path.isdir(example_dir):
    examples = [
        [os.path.join(example_dir, f)]
        for f in sorted(os.listdir(example_dir))
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ]

DESCRIPTION = (
    "Detects hard hats and high-visibility vests on construction sites and flags "
    "missing equipment as violations.\n\n"
    "**Model:** YOLO11s (ONNX) · **Classes:** hardhat, no-hardhat, vest, no-vest, person"
)

with gr.Blocks(title="PPE Compliance Detector") as demo:
    gr.Markdown("# 🦺 PPE Compliance Detector")
    gr.Markdown(DESCRIPTION)

    with gr.Tab("Image"):
        with gr.Row():
            with gr.Column():
                image_in = gr.Image(type="pil", label="Construction Site Image")
                image_conf = gr.Slider(0.1, 0.9, value=0.25, step=0.05,
                                       label="Confidence Threshold")
                image_btn = gr.Button("Detect PPE", variant="primary")
            with gr.Column():
                image_out = gr.Image(label="Detection Result")
                image_text = gr.Textbox(label="Compliance Summary", lines=10)
                image_json = gr.JSON(label="Structured Report")
        if examples:
            gr.Examples(examples=examples, inputs=image_in)
        image_btn.click(detect_ppe, [image_in, image_conf],
                        [image_out, image_text, image_json], api_name="detect")

    with gr.Tab("Video"):
        gr.Markdown(
            f"Upload a clip up to **{MAX_VIDEO_SECONDS} seconds**. Detection runs at "
            f"{SAMPLE_FPS} fps and the boxes are drawn onto every frame, so the result "
            "plays back smoothly. Processing takes roughly a minute on the free CPU tier."
        )
        with gr.Row():
            with gr.Column():
                video_in = gr.Video(label="Construction Site Video")
                video_conf = gr.Slider(0.1, 0.9, value=0.25, step=0.05,
                                       label="Confidence Threshold")
                video_btn = gr.Button("Detect PPE in Video", variant="primary")
            with gr.Column():
                video_out = gr.Video(label="Annotated Result")
                video_text = gr.Textbox(label="Compliance Summary", lines=10)
                video_json = gr.JSON(label="Structured Report")
        video_btn.click(detect_ppe_video, [video_in, video_conf],
                        [video_out, video_text, video_json], api_name="detect_video")

demo.queue(max_size=8).launch(ssr_mode=False)
