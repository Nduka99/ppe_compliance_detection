"""PPE compliance detection API — Gradio app served on Hugging Face Spaces."""

import json
import os

import gradio as gr
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

    report = {
        "violations": violations,
        "compliant": compliant,
        "workers": workers,
        "total_detections": len(result.boxes),
    }
    return annotated, build_summary(report), report


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


example_dir = os.path.join(BASE_DIR, "examples")
examples = []
if os.path.isdir(example_dir):
    examples = [
        [os.path.join(example_dir, f)]
        for f in sorted(os.listdir(example_dir))
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ]

demo = gr.Interface(
    fn=detect_ppe,
    inputs=[
        gr.Image(type="pil", label="Construction Site Image"),
        gr.Slider(
            minimum=0.1, maximum=0.9, value=0.25, step=0.05,
            label="Confidence Threshold",
        ),
    ],
    outputs=[
        gr.Image(label="Detection Result"),
        gr.Textbox(label="Compliance Summary", lines=10),
        gr.JSON(label="Structured Report"),
    ],
    title="🦺 PPE Compliance Detector",
    description=(
        "Upload a construction site image to detect hard hats and safety vests. "
        "The model identifies PPE violations (missing hard hat or vest) and "
        "highlights them with bounding boxes.\n\n"
        "**Model:** YOLO11s (ONNX) — 93.2% test mAP50 | "
        "**Classes:** hardhat, no-hardhat, vest, no-vest, person"
    ),
    examples=examples if examples else None,
    cache_examples=False,
    api_name="detect",
)

demo.launch(ssr_mode=False)
