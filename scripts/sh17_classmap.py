"""Definitively map SH17 YOLO indices -> class names via VOC↔YOLO box matching."""
import glob
import os
import xml.etree.ElementTree as ET
from collections import defaultdict

SH = r"C:/Users/nwagb/.cache/kagglehub/datasets/mugheesahmad/sh17-dataset-for-ppe-detection/versions/1"


def iou(a, b):
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0:
        return 0.0
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def voc_boxes(path):
    root = ET.parse(path).getroot()
    size = root.find("size")
    W, H = float(size.find("width").text), float(size.find("height").text)
    out = []
    for obj in root.findall("object"):
        n = obj.find("name").text
        b = obj.find("bndbox")
        x1 = float(b.find("xmin").text) / W
        y1 = float(b.find("ymin").text) / H
        x2 = float(b.find("xmax").text) / W
        y2 = float(b.find("ymax").text) / H
        out.append((n, x1, y1, x2, y2))
    return out


def yolo_boxes(path):
    out = []
    for ln in open(path).read().splitlines():
        if not ln.strip():
            continue
        c, cx, cy, w, h = ln.split()
        cx, cy, w, h = float(cx), float(cy), float(w), float(h)
        out.append((int(c), cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2))
    return out


votes = defaultdict(lambda: defaultdict(int))
n_imgs = 0
for x in glob.glob(os.path.join(SH, "voc_labels", "*.xml")):
    stem = os.path.splitext(os.path.basename(x))[0]
    l = os.path.join(SH, "labels", stem + ".txt")
    if not os.path.exists(l):
        continue
    try:
        vb, yb = voc_boxes(x), yolo_boxes(l)
    except Exception:
        continue
    n_imgs += 1
    used = set()
    for name, *vc in vb:
        best_j, best_iou = -1, 0.0
        for j, y in enumerate(yb):
            if j in used:
                continue
            s = iou(vc, y[1:])
            if s > best_iou:
                best_iou, best_j = s, j
        if best_j >= 0 and best_iou > 0.85:
            used.add(best_j)
            votes[yb[best_j][0]][name] += 1

print(f"images matched: {n_imgs}")
print("index -> class (majority vote, with purity):")
idx_to_name = {}
for idx in sorted(votes):
    ranked = sorted(votes[idx].items(), key=lambda kv: -kv[1])
    total = sum(votes[idx].values())
    name, cnt = ranked[0]
    idx_to_name[idx] = name
    print(f"  {idx:2d} = {name:20s} {cnt}/{total} ({100*cnt/total:.0f}% pure)")

vest_idx = [i for i, n in idx_to_name.items() if n == "safety-vest"]
print(f"\nSAFETY-VEST index = {vest_idx}")
print(f"PERSON index = {[i for i,n in idx_to_name.items() if n=='person']}")
print(f"HELMET index = {[i for i,n in idx_to_name.items() if n=='helmet']}")
