import gradio as gr
from ultralytics import YOLO
from PIL import Image
import numpy as np
import json
import os

# ---- Load model ----
MODEL_PATH = os.path.join(os.path.dirname(__file__), "best.onnx")
model = YOLO(MODEL_PATH)

CLASS_NAMES = ["hardhat", "no-hardhat", "vest", "no-vest", "person"]
VIOLATION_CLASSES = {"no-hardhat", "no-vest"}
COMPLIANT_CLASSES = {"hardhat", "vest"}


def detect_ppe(image, conf_threshold=0.25):
    """Run PPE detection on an uploaded image."""
    if image is None:
        return None, "No image provided."

    # Run inference
    results = model(image, imgsz=640, conf=conf_threshold, verbose=False)
    result = results[0]

    # Draw annotated image
    annotated = result.plot()
    annotated_rgb = Image.fromarray(annotated[..., ::-1])

    # Build compliance summary
    detections = result.boxes
    violations = []
    compliant = []
    persons = 0

    for box in detections:
        cls_name = CLASS_NAMES[int(box.cls)]
        conf = float(box.conf)

        if cls_name in VIOLATION_CLASSES:
            violations.append(f"{cls_name} ({conf:.0%})")
        elif cls_name in COMPLIANT_CLASSES:
            compliant.append(f"{cls_name} ({conf:.0%})")
        elif cls_name == "person":
            persons += 1

    summary = ""
    if violations:
        summary += f"⚠️ VIOLATIONS DETECTED ({len(violations)}):
"
        for v in violations:
            summary += f"  ❌ {v}
"
        summary += "
"
    else:
        summary += "✅ No PPE violations detected.

"

    if compliant:
        summary += f"PPE Compliant Items ({len(compliant)}):
"
        for c in compliant:
            summary += f"  ✅ {c}
"
        summary += "
"

    summary += f"Workers detected: {persons}
"
    summary += f"Total detections: {len(detections)}"

    # Build JSON result for API consumers (Vercel frontend)
    api_result = {
        "violations": violations,
        "compliant": compliant,
        "persons": persons,
        "total_detections": len(detections),
        "boxes": [],
    }
    for box in detections:
        api_result["boxes"].append({
            "class": CLASS_NAMES[int(box.cls)],
            "confidence": round(float(box.conf), 4),
            "bbox": box.xyxy[0].tolist(),
        })

    return annotated_rgb, summary


# ---- Build Gradio interface ----
example_dir = os.path.join(os.path.dirname(__file__), "examples")
examples = []
if os.path.isdir(example_dir):
    for f in sorted(os.listdir(example_dir)):
        if f.lower().endswith((".jpg", ".jpeg", ".png")):
            examples.append([os.path.join(example_dir, f)])

demo = gr.Interface(
    fn=detect_ppe,
    inputs=[
        gr.Image(type="numpy", label="Upload Construction Site Image"),
        gr.Slider(
            minimum=0.1, maximum=0.9, value=0.25, step=0.05,
            label="Confidence Threshold",
        ),
    ],
    outputs=[
        gr.Image(label="Detection Result"),
        gr.Textbox(label="Compliance Summary", lines=10),
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
)

demo.launch()
