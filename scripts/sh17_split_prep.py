"""Split SH17 vest images into disjoint train/test halves (by image, no leakage).

- test split (40%): image stem list saved to data/sh17_vest_test.txt — used by the
  held-out real-world eval for ALL models, so comparisons stay apples-to-apples.
- train split (60%): mapped to our classes + pseudo-labeled violations, written to
  data/vest_boost_sh17/{images,labels} for round-3 training.

SH17 (verified) -> ours:  safety-vest 16 -> vest 2 | helmet 10 -> hardhat 0 |
person 0 -> person 4.  Missing {no-hardhat 1, no-vest 3} pseudo-labeled from
baseline, dropping boxes that overlap a human box.
"""
import os

os.environ["YOLO_AUTOINSTALL"] = "false"

import glob
import random
from pathlib import Path

from PIL import Image
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent.parent
SH = Path.home() / ".cache/kagglehub/datasets/mugheesahmad/sh17-dataset-for-ppe-detection/versions/1"
SH_VEST, SH_HELMET, SH_PERSON = 16, 10, 0
MAP = {SH_VEST: 2, SH_HELMET: 0, SH_PERSON: 4}
PSEUDO = {1, 3}       # no-hardhat, no-vest
CONF = 0.45
TEST_FRAC = 0.40

DST_IMG = ROOT / "data/vest_boost_sh17/images"
DST_LBL = ROOT / "data/vest_boost_sh17/labels"
DST_IMG.mkdir(parents=True, exist_ok=True)
DST_LBL.mkdir(parents=True, exist_ok=True)


def iou(a, b):
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0:
        return 0.0
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


# vest-containing images
vest_imgs = []
for l in glob.glob(str(SH / "labels" / "*.txt")):
    ids = [ln.split()[0] for ln in open(l).read().splitlines() if ln.strip()]
    if str(SH_VEST) in ids:
        stem = Path(l).stem
        for ext in (".jpg", ".jpeg"):
            p = SH / "images" / f"{stem}{ext}"
            if p.exists():
                vest_imgs.append((p, Path(l)))
                break

random.seed(42)
random.shuffle(vest_imgs)
n_test = int(len(vest_imgs) * TEST_FRAC)
test_split = vest_imgs[:n_test]
train_split = vest_imgs[n_test:]
print(f"SH17 vest images: {len(vest_imgs)} -> test {len(test_split)}, train {len(train_split)}")

# save test stem list
(ROOT / "data/sh17_vest_test.txt").write_text("\n".join(sorted(p.stem for p, _ in test_split)))
print(f"wrote data/sh17_vest_test.txt ({len(test_split)} held-out test images)")

model = YOLO(ROOT / "results/weights/ppe_yolo11s.pt")
box_counts = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}
kept = 0
for img_path, lbl_path in train_split:
    pil = Image.open(img_path).convert("RGB")
    w, h = pil.size

    human_lines, human_boxes = [], []
    for ln in lbl_path.read_text().splitlines():
        if not ln.strip():
            continue
        p = ln.split()
        m = MAP.get(int(p[0]))
        if m is None:
            continue
        cx, cy, bw, bh = (float(v) for v in p[1:5])
        human_lines.append(f"{m} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")
        human_boxes.append((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2))
        box_counts[m] += 1

    for b in model.predict(pil, imgsz=1280, conf=CONF, verbose=False)[0].boxes:
        cls = int(b.cls)
        if cls not in PSEUDO:
            continue
        x1, y1, x2, y2 = (float(v) for v in b.xyxy[0])
        nb = (x1 / w, y1 / h, x2 / w, y2 / h)
        if any(iou(nb, hb) > 0.5 for hb in human_boxes):
            continue
        bw, bh = (x2 - x1) / w, (y2 - y1) / h
        if bw < 0.005 or bh < 0.005:
            continue
        human_lines.append(f"{cls} {(x1+x2)/2/w:.6f} {(y1+y2)/2/h:.6f} {bw:.6f} {bh:.6f}")
        box_counts[cls] += 1

    stem = f"sh17_{img_path.stem}"
    pil.save(DST_IMG / f"{stem}.jpg", quality=95)
    (DST_LBL / f"{stem}.txt").write_text("\n".join(human_lines))
    kept += 1

print(f"train images written: {kept}")
print(f"boxes -> hardhat: {box_counts[0]}, no-hardhat: {box_counts[1]}, vest: {box_counts[2]}, "
      f"no-vest: {box_counts[3]}, person: {box_counts[4]}")
