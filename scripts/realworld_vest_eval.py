"""Real-world vest detection experiment.

Independent test set: SH17 (Pexels stock photos), 213 images with 530 human-labeled
safety-vest boxes — neither model trained on any of it. Measures how many of those
real vests each model detects (class 2 = vest, matched by IoU), swept over confidence.
Inference at 640px to match the deployed ONNX.
"""
import os

os.environ["YOLO_AUTOINSTALL"] = "false"

import glob
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image
from ultralytics import YOLO

ROOT = Path(r"c:\Users\nwagb\Desktop\SponsorshipGlobalTalentPrep\PPE_Compliance_detection")
SH = Path.home() / ".cache/kagglehub/datasets/mugheesahmad/sh17-dataset-for-ppe-detection/versions/1"
RESULTS = ROOT / "results"
SH_VEST = 16          # verified SH17 index for safety-vest
MY_VEST = 2           # our model class 2 = "vest present" — the correct positive for a worn hi-vis vest
IOU_STRICT = 0.5      # standard detection match
IOU_LOOSE = 0.3       # "found the vest region" despite box-convention differences between datasets
THRESHOLDS = [0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50]

SURFACE, INK, INK2, MUTED = "#fcfcfb", "#0b0b0b", "#52514e", "#898781"
GRID, AXIS = "#e1e0d9", "#c3c2b7"
GREY, BLUE, YELLOW = "#898781", "#2a78d6", "#eda100"
plt.rcParams.update({
    "font.family": "Segoe UI", "text.color": INK, "axes.edgecolor": AXIS,
    "axes.labelcolor": INK2, "xtick.color": MUTED, "ytick.color": INK2,
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
})


def iou(a, b):
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0:
        return 0.0
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def gt_vests(label_path, w, h):
    out = []
    for ln in open(label_path).read().splitlines():
        if not ln.strip():
            continue
        p = ln.split()
        if int(p[0]) != SH_VEST:
            continue
        cx, cy, bw, bh = (float(v) for v in p[1:5])
        out.append((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2))  # normalized xyxy
    return out


def find_run(pattern, exclude=None):
    dirs = [d for d in glob.glob(str(ROOT / "notebooks/runs/detect" / pattern))
            if exclude is None or exclude not in d]
    dirs = [d for d in dirs if os.path.exists(os.path.join(d, "weights", "best.pt"))]
    return Path(sorted(dirs, key=os.path.getmtime)[-1]) / "weights" / "best.pt"


def main():
    # Held-out SH17 test split (84 images) — shares NO images with round-3 training.
    # Restricting to this split keeps baseline/r1/r2/r3 comparable on identical data.
    test_file = ROOT / "data/sh17_vest_test.txt"
    only_stems = set(test_file.read_text().split()) if test_file.exists() else None

    images = []
    for l in glob.glob(str(SH / "labels" / "*.txt")):
        stem = Path(l).stem
        if only_stems is not None and stem not in only_stems:
            continue
        ids = [ln.split()[0] for ln in open(l).read().splitlines() if ln.strip()]
        if str(SH_VEST) in ids:
            for ext in (".jpg", ".jpeg"):
                p = SH / "images" / f"{stem}{ext}"
                if p.exists():
                    images.append((p, Path(l)))
                    break
    print(f"real-world vest test set (held-out SH17): {len(images)} images")

    models = {
        "baseline": YOLO(ROOT / "results/weights/ppe_yolo11s.pt"),
        "round 2": YOLO(find_run("ppe_yolo11s_vboost_r2*")),
        "round 3": YOLO(find_run("ppe_yolo11s_vboost_r3*")),
    }

    total_gt = 0
    tp_at = {name: {t: 0 for t in THRESHOLDS} for name in models}       # strict IoU 0.5
    tp_loose = {name: {t: 0 for t in THRESHOLDS} for name in models}    # loose IoU 0.3
    pred_count = {name: {t: 0 for t in THRESHOLDS} for name in models}  # for precision

    def count_matches(vest_preds, gts, t, iou_min):
        used = set()
        n_pred = 0
        for conf, box in vest_preds:
            if conf < t:
                continue
            n_pred += 1
            bestj, bestiou = -1, iou_min
            for j, g in enumerate(gts):
                if j in used:
                    continue
                s = iou(box, g)
                if s >= bestiou:
                    bestiou, bestj = s, j
            if bestj >= 0:
                used.add(bestj)
        return len(used), n_pred

    for img_path, lbl_path in images:
        pil = Image.open(img_path).convert("RGB")
        w, h = pil.size
        gts = gt_vests(lbl_path, w, h)
        total_gt += len(gts)

        for name, mdl in models.items():
            res = mdl.predict(pil, imgsz=640, conf=0.10, verbose=False)[0]
            vest_preds = []
            for b in res.boxes:
                if int(b.cls) != MY_VEST:
                    continue
                x1, y1, x2, y2 = (float(v) / (w if i % 2 == 0 else h) for i, v in enumerate(b.xyxy[0]))
                vest_preds.append((float(b.conf), (x1, y1, x2, y2)))
            vest_preds.sort(key=lambda p: -p[0])

            for t in THRESHOLDS:
                tp_s, n_pred = count_matches(vest_preds, gts, t, IOU_STRICT)
                tp_l, _ = count_matches(vest_preds, gts, t, IOU_LOOSE)
                tp_at[name][t] += tp_s
                tp_loose[name][t] += tp_l
                pred_count[name][t] += n_pred

    print(f"total real-world vest instances (ground truth): {total_gt}\n")
    print("VEST RECALL (strict IoU>=0.5) by confidence threshold:")
    print(f"{'threshold':>10} | " + " | ".join(f"{n:>9}" for n in models))
    print("-" * 46)
    recalls = {name: [] for name in models}
    for t in THRESHOLDS:
        row = f"{t:>10.2f} | "
        for name in models:
            r = tp_at[name][t] / total_gt
            recalls[name].append(r)
            row += f"{r*100:>8.1f}% | "
        print(row.rstrip(" |"))

    # headline: at the app's default conf 0.25
    i25 = THRESHOLDS.index(0.25)
    print(f"\n=== @ conf 0.25 (app default) ===")
    print(f"{'model':>9} | strict recall | loose recall | precision")
    for name in models:
        rs = tp_at[name][0.25] / total_gt
        rl = tp_loose[name][0.25] / total_gt
        pr = tp_at[name][0.25] / pred_count[name][0.25] if pred_count[name][0.25] else 0
        print(f"  {name:>7} | {rs*100:>10.1f}% | {rl*100:>10.1f}% | {pr*100:>7.1f}%  "
              f"({tp_at[name][0.25]}/{total_gt} vests)")

    # ---- chart: recall vs confidence ----
    fig, ax = plt.subplots(figsize=(9, 5))
    colors = {"baseline": GREY, "round 2": YELLOW, "round 3": BLUE}
    for name in models:
        ax.plot(THRESHOLDS, [r * 100 for r in recalls[name]], marker="o", ms=5, lw=2,
                color=colors.get(name, GREY), label=name)
        ax.text(THRESHOLDS[-1] + 0.005, recalls[name][-1] * 100, name, va="center",
                fontsize=9.5, color=colors.get(name, GREY))
    ax.axvline(0.25, color=AXIS, lw=1, ls=(0, (4, 4)))
    ax.text(0.25, ax.get_ylim()[1], " app default", fontsize=8.5, color=MUTED, va="top")
    ax.set_xlabel("confidence threshold", fontsize=10)
    ax.set_ylabel("vest recall (% of real vests detected)", fontsize=10)
    ax.grid(axis="y", color=GRID, lw=0.8)
    ax.set_axisbelow(True)
    for s in ["top", "right"]:
        ax.spines[s].set_visible(False)
    ax.set_xlim(0.08, 0.56)
    ax.legend(frameon=False, fontsize=9.5, loc="upper right")
    ax.set_title(f"Real-world vest detection — held-out SH17 ({len(images)} images, {total_gt} vests)",
                 fontsize=12, color=INK, loc="left", pad=12)
    fig.tight_layout()
    fig.savefig(RESULTS / "nb09_r3_realworld_vest_recall.png", dpi=150)
    plt.close(fig)
    print("\nchart saved: results/nb09_r3_realworld_vest_recall.png")

    # verdict
    b = recalls["baseline"][i25]
    r3 = recalls["round 3"][i25]
    r2 = recalls["round 2"][i25]
    print(f"\nVERDICT @ conf 0.25 (held-out real-world vests):")
    print(f"  baseline {b*100:.1f}%  ->  round 2 {r2*100:.1f}%  ->  round 3 {r3*100:.1f}%")
    print(f"  round 3 vs baseline: {(r3-b)*100:+.1f} pp | round 3 vs round 2: {(r3-r2)*100:+.1f} pp")


if __name__ == "__main__":
    main()
