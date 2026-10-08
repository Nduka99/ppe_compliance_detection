"""Guarantee no training image near-duplicates a held-out SH17 test image.
Deletes any offending file from the generated training dirs and reports counts."""
import glob
from pathlib import Path

import numpy as np
from PIL import Image
import imagehash

ROOT = Path(__file__).resolve().parent.parent
SH = Path.home() / ".cache/kagglehub/datasets/mugheesahmad/sh17-dataset-for-ppe-detection/versions/1"
THRESH = 6

test_stems = set((ROOT / "data/sh17_vest_test.txt").read_text().split())
test_hashes = []
for stem in test_stems:
    for ext in (".jpg", ".jpeg"):
        p = SH / "images" / f"{stem}{ext}"
        if p.exists():
            test_hashes.append(np.array(imagehash.phash(Image.open(p)).hash.flatten(), dtype=bool))
            break
print(f"held-out test hashes: {len(test_hashes)}")


def guard(dir_path):
    imgs = sorted(Path(dir_path).glob("*.jpg"))
    removed = 0
    for p in imgs:
        try:
            h = np.array(imagehash.phash(Image.open(p)).hash.flatten(), dtype=bool)
        except Exception:
            continue
        if any(np.count_nonzero(th != h) <= THRESH for th in test_hashes):
            p.unlink()
            lbl = Path(str(p).replace("images", "labels")).with_suffix(".txt")
            if lbl.exists():
                lbl.unlink()
            removed += 1
    print(f"  {Path(dir_path).parent.name}: {len(imgs)} imgs, removed {removed} leaking")
    return removed


total = 0
for d in ["data/vest_boost/images", "data/vest_boost2/images", "data/vest_boost_sh17/images"]:
    total += guard(ROOT / d)
print(f"total leaking training images removed: {total}")
