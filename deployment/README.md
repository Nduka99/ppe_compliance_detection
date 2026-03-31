---
title: PPE Compliance Detector
emoji: "\U0001F9BA"
colorFrom: yellow
colorTo: red
sdk: gradio
sdk_version: 6.9.0
app_file: app.py
pinned: false
license: mit
---

# PPE Compliance Detector — Backend

Gradio-based inference API deployed on Hugging Face Spaces. Accepts construction site images and returns annotated detections with a compliance summary.

## Architecture

```
Client (image + conf_threshold)
    │
    ▼
Gradio Interface (port 7860)
    │
    ▼
YOLO11s ONNX Model (best.onnx, 38 MB)
    │
    ▼
Annotated Image + Compliance Summary
```

## Model

| Property | Value |
|----------|-------|
| Architecture | YOLO11s (Ultralytics) |
| Parameters | 9.4M |
| Format | ONNX (CPU-optimised via onnxruntime) |
| Input size | 640px |
| Training image size | 1280px |
| Training epochs | 100 |
| Training hardware | NVIDIA RTX 4060 (8 GB VRAM) |
| Test mAP50 | 93.2% |
| Test mAP50-95 | 63.9% |
| Minority class AP50 | >91% (vest, no-vest) |

## Classes

| Class | Type | Description |
|-------|------|-------------|
| `hardhat` | Compliant | Worker wearing a hard hat |
| `no-hardhat` | Violation | Worker without a hard hat |
| `vest` | Compliant | Worker wearing a high-vis vest |
| `no-vest` | Violation | Worker without a high-vis vest |
| `person` | Neutral | Full body of a worker |

## API

The Gradio interface exposes a single `/detect` endpoint:

**Inputs:**
- `image` (numpy array) — Construction site image
- `conf_threshold` (float, 0.1-0.9, default 0.25) — Minimum detection confidence

**Outputs:**
- Annotated image with bounding boxes and class labels
- Text compliance summary listing violations and compliant items

## Training Data

Merged from three public datasets (~10,864 images, 144,986 bounding boxes):

| Dataset | Images | Source |
|---------|--------|--------|
| Construction Site Safety | 2,801 | Roboflow |
| SHWD (Safety Helmet Wearing Dataset) | 7,581 | GitHub |
| Pictor-PPE | 784 | GitHub |

## Files

```
deployment/
├── app.py               # Gradio interface and inference logic
├── best.onnx            # YOLO11s ONNX model (38 MB)
├── best.pt              # YOLO11s PyTorch weights (19 MB)
├── Dockerfile           # Python 3.11-slim container for HF Spaces
├── requirements.txt     # Runtime dependencies
├── runtime.txt          # Python version specification
├── model_config.json    # Class names, violation mapping, model metadata
├── training_args.yaml   # Full training hyperparameters from NB05
├── hyp_ppe.yaml         # Augmentation hyperparameters
└── examples/            # Demo images for Gradio interface
    ├── example1.jpg
    ├── example2.jpg
    └── example3.jpg
```

## Dependencies

```
ultralytics>=8.3.50
onnxruntime>=1.20.1
opencv-python-headless>=4.10.0
Pillow>=11.1.0
numpy<2.0
```

PyTorch CPU wheels are pulled from `--extra-index-url https://download.pytorch.org/whl/cpu` to minimise container size.

## Local Development

```bash
cd deployment
pip install -r requirements.txt
python app.py
# Gradio interface at http://localhost:7860
```

## Docker

```bash
cd deployment
docker build -t ppe-detector .
docker run -p 7860:7860 ppe-detector
```

## Deployment

Deployed on Hugging Face Spaces with Docker SDK. A GitHub Actions workflow (`.github/workflows/keep-alive.yml`) pings the Space every 14 minutes to prevent cold sleep on the free tier.
