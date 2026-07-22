"""Round-3 data prep: add the johnsyin hardhat+vest dataset as vest_boost2.

- Uses only 'pos_' images (they carry human hardhat/vest labels).
- Maps johnsyin class 0->0 (hardhat), 1->2 (vest); keeps those human labels.
- Pseudo-labels the missing classes {1 no-hardhat, 3 no-vest, 4 person} with the
  baseline model, dropping any pseudo box that overlaps a human box (IoU>0.5).
- Leakage guard: drops any image within phash Hamming<=6 of an SH17 vest test
  image; also drops near-dups of the existing booster.
Output: data/vest_boost2/{images,labels}
"""
import os

os.environ["YOLO_AUTOINSTALL"] = "false"

import glob
from pathlib import Path

import numpy as np
from PIL import Image
import imagehash
from ultralytics import YOLO

ROOT = Path(r"c:\Users\nwagb\Desktop\SponsorshipGlobalTalentPrep\PPE_Compliance_detection")
SRC = Path(r"C:/Users/nwagb/.cache/kagglehub/datasets/johnsyin97/hardhat-and-safety-vest-image-for-object-detection/versions/1/train")
SH = Path(r"C:/Users/nwagb/.cache/kagglehub/datasets/mugheesahmad/sh17-dataset-for-ppe-detection/versions/1")
SH_VEST = 16
DST_IMG = ROOT / "data/vest_boost2/images"
DST_LBL = ROOT / "data/vest_boost2/labels"
JOHN_MAP = {0: 0, 1: 2}          # johnsyin hardhat->0, vest->2
PSEUDO = {1, 3, 4}               # no-hardhat, no-vest, person
CONF = 0.45

DST_IMG.mkdir(parents=True, exist_ok=True)
DST_LBL.mkdir(parents=True, exist_ok=True)


def iou(a, b):
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0:
        return 0.0
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def phash_set(paths):
    hs = []
    for p in paths:
        try:
            hs.append(np.array(imagehash.phash(Image.open(p)).hash.flatten(), dtype=bool))
        except Exception:
            pass
    return hs


def min_ham(h, guard):
    return min((np.count_nonzero(g != h) for g in guard), default=64)


print("hashing SH17 vest test images (leakage guard)...")
sh_vest_imgs = []
for l in glob.glob(str(SH / "labels" / "*.txt")):
    ids = [ln.split()[0] for ln in open(l).read().splitlines() if ln.strip()]
    if str(SH_VEST) in ids:
        for ext in (".jpg", ".jpeg"):
            p = SH / "images" / f"{Path(l).stem}{ext}"
            if p.exists():
                sh_vest_imgs.append(p)
                break
guard_sh = phash_set(sh_vest_imgs)
print(f"  SH17 vest hashes: {len(guard_sh)}")

print("hashing existing booster (dedup)...")
guard_boost = phash_set(sorted((ROOT / "data/vest_boost/images").glob("*.jpg")))
print(f"  booster hashes: {len(guard_boost)}")

model = YOLO(ROOT / "results/weights/ppe_yolo11s.pt")

pos_imgs = sorted(SRC.glob("pos_*.jpg"))
print(f"johnsyin pos images: {len(pos_imgs)}")

kept = leak = dup = empty = 0
box_counts = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}
for i, img_path in enumerate(pos_imgs, 1):
    try:
        pil = Image.open(img_path).convert("RGB")
        w, h = pil.size
        hsh = np.array(imagehash.phash(pil).hash.flatten(), dtype=bool)
    except Exception:
        continue

    if min_ham(hsh, guard_sh) <= 6:
        leak += 1
        continue
    if min_ham(hsh, guard_boost) <= 4:
        dup += 1
        continue

    # human labels -> our classes (hardhat 0, vest 2)
    human_lines, human_boxes = [], []
    tf = img_path.with_suffix(".txt")
    if tf.exists():
        for ln in tf.read_text().splitlines():
            if not ln.strip():
                continue
            c, cx, cy, bw, bh = ln.split()
            c = JOHN_MAP.get(int(c))
            if c is None:
                continue
            cx, cy, bw, bh = float(cx), float(cy), float(bw), float(bh)
            human_lines.append(f"{c} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")
            human_boxes.append((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2))
            box_counts[c] += 1

    # pseudo-label missing classes
    pseudo_lines = []
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
        pseudo_lines.append(f"{cls} {(x1+x2)/2/w:.6f} {(y1+y2)/2/h:.6f} {bw:.6f} {bh:.6f}")
        box_counts[cls] += 1

    all_lines = human_lines + pseudo_lines
    if not all_lines:
        empty += 1
        continue
    stem = f"john_{img_path.stem}"
    pil.save(DST_IMG / f"{stem}.jpg", quality=95)
    (DST_LBL / f"{stem}.txt").write_text("\n".join(all_lines))
    kept += 1
    if i % 800 == 0:
        print(f"  {i}/{len(pos_imgs)} processed, kept {kept}")

print(f"\nkept: {kept} | leakage-dropped: {leak} | near-dup: {dup} | empty: {empty}")
print(f"boxes -> hardhat: {box_counts[0]}, no-hardhat: {box_counts[1]}, vest: {box_counts[2]}, "
      f"no-vest: {box_counts[3]}, person: {box_counts[4]}")
