# PPE Compliance Detection

An end-to-end computer vision system that detects whether construction site workers are wearing required Personal Protective Equipment (hard hats and high-visibility vests). The system classifies each worker as compliant or non-compliant, draws bounding boxes around detections, and generates a compliance summary highlighting violations.

**Live Demo:** [ppe-detection-blush.vercel.app](https://ppe-detection-blush.vercel.app)

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Dataset & Data Pipeline](#dataset--data-pipeline)
- [Exploratory Data Analysis](#exploratory-data-analysis)
- [Model Training](#model-training)
- [Evaluation & Results](#evaluation--results)
- [Deployment](#deployment)
- [Frontend](#frontend)
- [Project Structure](#project-structure)
- [Known Limitations](#known-limitations)
- [Future Work](#future-work)
- [Setup & Reproduction](#setup--reproduction)
- [License](#license)

## Architecture Overview

```
 Data Pipeline          Training & Eval          Deployment
 ───────────            ───────────────          ──────────
 3 Public Datasets      YOLO11n (baseline)       HF Spaces (Gradio + ONNX)
       │                YOLO11s (primary)              │
  NB01: Merge &               │                 React + Vite Frontend
  Format Convert         NB07: Compare           (Vercel)
       │                       │                       │
  NB02: EDA              Best model ──────> ONNX Export + Docker
       │
  NB03: Augmentation
```

The pipeline follows a structured notebook workflow (NB01-NB08), covering data acquisition, exploration, preprocessing, training, evaluation, and deployment.

## Dataset & Data Pipeline

### Source Datasets

Three publicly available construction site PPE datasets were merged into a single unified dataset:

| Dataset | Images | Original Format | Contribution |
|---------|--------|-----------------|--------------|
| Construction Site Safety (Roboflow) | 2,801 | YOLO txt (10 classes) | Hardhat + vest annotations |
| SHWD (Safety Helmet Wearing Dataset) | 7,581 | VOC XML (non-standard `<n>` tag) | Largest source, helmet-focused |
| Pictor-PPE | 784 | TSV manifest (crowd-sourced) | Research variety |

### Pipeline Steps (NB01)

1. **Format conversion** — All datasets converted to YOLO txt format. SHWD required custom XML parsing for non-standard tags. Pictor-PPE required TSV-to-YOLO coordinate normalisation. CSS required class remapping from 10 to 5 classes (dropped Mask, Safety Cone, machinery, vehicle).
2. **Deduplication** — MD5 hashing removed 37 exact duplicates. Perceptual hashing removed 58 near-duplicates. 11,034 &rarr; 10,939 unique image-label pairs.
3. **Quality filtering** — Removed corrupted images, images below 200px minimum dimension, and invalid bounding boxes. 10,939 &rarr; 10,864 valid pairs.
4. **Stratified split** (80/10/10) — Stratified by source dataset to ensure each split contains representative samples from CSS, SHWD, and Pictor-PPE.

### Final Dataset

| Split | Images | Bounding Boxes |
|-------|--------|----------------|
| Train | 8,691 | ~116K |
| Val | 1,086 | ~14.5K |
| Test | 1,087 | ~14.5K |
| **Total** | **10,864** | **144,986** |

### 5 Unified Classes

| Class | Count | % of Total | Role |
|-------|-------|------------|------|
| `hardhat` | 12,074 | 8.3% | Compliant |
| `no-hardhat` | 113,252 | 78.1% | Violation |
| `vest` | 3,135 | 2.2% | Compliant (minority) |
| `no-vest` | 4,158 | 2.9% | Violation (minority) |
| `person` | 12,367 | 8.5% | Neutral |

The dataset exhibits significant class imbalance, with `no-hardhat` dominating at 78.1% and vest classes representing only ~5% combined. This imbalance was addressed through augmentation strategy in NB03.

## Exploratory Data Analysis

**NB02 & NB02b** performed forensic exploration of the merged dataset:

- **Class distribution analysis** across train/val/test splits confirmed consistent stratification
- **Spatial distribution heatmaps** revealed bounding box centre-point clustering patterns
- **Bounding box scale & aspect ratio analysis** showed wide variation (thumbnail to full-image)
- **Per-source statistics** quantified each dataset's contribution to class balance
- **Co-occurrence analysis** identified which classes typically appear together
- **Image quality sampling** assessed resolution, brightness, and contrast distributions

## Model Training

### Augmentation Strategy (NB03)

- **YOLO-native**: Mosaic (1.0), Mixup (0.15), Copy-Paste (0.15), Erasing (0.4)
- **Geometric**: Rotation (10 deg), Translation (0.1), Scale (0.5), Shear (2.0)
- **Colour**: HSV hue (0.015), saturation (0.7), value (0.4)
- **Minority class oversampling**: Vest (2x), No-vest (1.5x) via Albumentations (RandomFog, RandomRain, GaussNoise, MotionBlur)

### Shared Training Configuration

- **Image size**: 1280px
- **Epochs**: 100
- **Optimiser**: SGD (lr=0.01, momentum=0.937, weight_decay=0.0005)
- **Warmup**: 3 epochs
- **Loss weights**: box=7.5, cls=0.5, dfl=1.5
- **Hardware**: NVIDIA RTX 4060 (8 GB VRAM)

### YOLO11n — Baseline (NB04)

- **Parameters**: 2.6M
- **Batch size**: 8
- **Purpose**: Establish baseline performance and validate the data pipeline

### YOLO11s — Primary Model (NB05)

- **Parameters**: 9.4M
- **Batch size**: 4 (VRAM-limited)
- **Purpose**: Primary deployment model balancing accuracy and inference speed
- **All-in-one notebook**: Training + post-training evaluation in a single notebook

### RT-DETR-l — Transformer Model (NB06)

- **Status**: Deferred. At 93.2% mAP50, the marginal gain did not justify the estimated 40-50 hours of training time on the RTX 4060. Reserved for future work.

## Evaluation & Results

**NB07** provides a comprehensive side-by-side comparison of both trained models.

### Overall Performance

| Metric | YOLO11n | YOLO11s |
|--------|---------|---------|
| Parameters | 2.6M | 9.4M |
| Val mAP50 | 90.5% | **94.1%** |
| Test mAP50 | 88.6% | **93.2%** |
| Test mAP50-95 | 57.6% | **63.9%** |
| Inference | 5.7 ms (141 FPS) | 11.4 ms (77 FPS) |

### Per-Class AP50 (Test Set)

| Class | YOLO11n | YOLO11s | Delta |
|-------|---------|---------|-------|
| hardhat | 91.9% | 94.0% | +2.1% |
| no-hardhat | 95.6% | 96.6% | +1.0% |
| vest (minority) | 84.5% | **92.0%** | **+7.5%** |
| no-vest (minority) | 84.5% | **92.1%** | **+7.6%** |
| person | 86.2% | 91.5% | +5.3% |

YOLO11s was selected for deployment based on its superior performance across all classes, particularly the 7-8% improvement on minority vest classes, while maintaining real-time inference speed at 77 FPS.

### Evaluation Artifacts

- Confusion matrices (side-by-side)
- Training dynamics (overlaid loss curves)
- Per-class AP50 comparison charts
- Minority class progression (epoch-by-epoch vest/no-vest AP)
- Radar plot (per-class performance)
- Speed vs. accuracy trade-off analysis
- Executive summary CSV (`nb07_final_summary.csv`)

## Deployment

### Backend (Hugging Face Spaces)

- **Framework**: Gradio
- **Model format**: ONNX (38 MB, CPU-optimised via onnxruntime)
- **Container**: Docker (Python 3.11-slim)
- **Inference**: 640px input size, configurable confidence threshold (0.1-0.9)
- **Output**: Annotated image with bounding boxes + text compliance summary
- **Keep-alive**: GitHub Actions workflow pings the Space every 14 minutes to prevent cold sleep

See [deployment/README.md](deployment/README.md) for backend-specific details.

### Frontend (Vercel)

- **Stack**: React 19 + Vite + Tailwind CSS
- **Features**: Image upload, video upload (10s max, frame-by-frame processing), confidence slider, dark mode, backend health indicator
- **Connection**: `@gradio/client` SDK communicates with HF Spaces backend

See [frontend/README.md](frontend/README.md) for frontend-specific details.

## Project Structure

```
PPE_Compliance_detection/
├── notebooks/
│   ├── NB01_Data_Acquisition.ipynb      # Dataset merge, format conversion, split
│   ├── NB02_Forensic_Exploration.ipynb  # EDA: class distribution, spatial analysis
│   ├── NB02b_forensic_exploration.ipynb # Supplementary: co-occurrence, quality
│   ├── NB03_Preprocessing.ipynb         # Augmentation strategy
│   ├── NB04_Training_YOLO11n.ipynb      # YOLO11n baseline (100 epochs)
│   ├── NB04c_Post_Training_Eval.ipynb   # YOLO11n checkpoint analysis
│   ├── NB05_Training_YOLO11s.ipynb      # YOLO11s primary model (all-in-one)
│   ├── NB06_Training_RTDETR.ipynb       # RT-DETR (deferred)
│   ├── NB07_Evaluation.ipynb            # Model comparison & benchmarking
│   └── NB08_Deployment.ipynb            # ONNX export & HF Spaces setup
├── data/
│   ├── processed/                       # Final dataset (images + labels)
│   ├── ppe_dataset.yaml                 # YOLO dataset config
│   ├── hyp_ppe.yaml                     # Augmentation hyperparameters
│   └── training_config.json             # Model-specific training configs
├── deployment/
│   ├── app.py                           # Gradio web interface
│   ├── best.onnx                        # YOLO11s ONNX model (38 MB)
│   ├── best.pt                          # YOLO11s PyTorch weights (19 MB)
│   ├── Dockerfile                       # HF Spaces container
│   ├── requirements.txt                 # Backend dependencies
│   ├── model_config.json                # Class names, violation mapping
│   ├── training_args.yaml               # Full training hyperparameters
│   └── examples/                        # Demo images
├── frontend/
│   ├── src/
│   │   ├── App.jsx                      # Main application logic
│   │   ├── api.js                       # Gradio client wrapper
│   │   └── components/                  # React components
│   ├── package.json
│   └── vite.config.js
├── results/                             # Training logs, metrics CSVs, plots
├── .github/workflows/keep-alive.yml     # Prevent HF Space cold sleep
└── requirements.txt                     # Full Python environment
```

## Known Limitations

1. **Vest detection on novel images** — While the model achieves 92% AP50 on vest classes within the test set distribution, vest detection on arbitrary real-world images is inconsistent. This is likely due to limited visual diversity in vest appearances across the three training datasets. Hardhats generalise much better due to their distinctive shape.

2. **Class imbalance** — `no-hardhat` represents 78% of all annotations. While augmentation and oversampling mitigate this during training, the model's real-world vest detection is still weaker than hardhat detection.

3. **CPU inference latency** — The HF Spaces free tier runs on CPU. Single-image inference takes 2-4 seconds. Video processing (20 frames) takes proportionally longer.

4. **10-second video limit** — Video upload is capped at 10 seconds to keep API call count manageable on the free tier.

## Future Work

- **RT-DETR training** — Train the RT-DETR-l transformer-based detector (NB06) for comparison against the YOLO family. Expected to improve on fine-grained vest detection due to the attention mechanism, though at higher computational cost.
- **Expanded vest training data** — Curate additional vest-specific images covering a wider range of vest colours, styles, and occlusion scenarios to improve real-world vest detection.
- **Real-time video streaming** — Implement webcam/RTSP stream processing with `model.track()` and ByteTrack for continuous monitoring scenarios.
- **Edge deployment** — Export YOLO11n to TensorRT/CoreML for on-device inference on mobile or embedded hardware.
- **Multi-PPE expansion** — Extend to additional PPE classes (safety goggles, gloves, boots) with appropriate training data.

## Setup & Reproduction

### Prerequisites

- Python 3.11+
- NVIDIA GPU with CUDA (for training; inference runs on CPU)
- Node.js 18+ (for frontend)

### Backend (Local)

```bash
cd deployment
pip install -r requirements.txt
python app.py
# Opens Gradio interface at http://localhost:7860
```

### Frontend (Local)

```bash
cd frontend
npm install
echo "VITE_SPACE_ID=nduka1999/PPE" > .env
npm run dev
# Opens React app at http://localhost:5173
```

### Training (Reproduce from scratch)

```bash
pip install -r requirements.txt
# Run notebooks NB01 through NB08 in order
# Requires ~8 GB VRAM GPU, ~3 hours per model
```

## License

MIT
