"""Resume the round-3 fine-tune from its last checkpoint.

Ultralytics' resume=True restores optimizer state, LR schedule and the epoch
counter from last.pt, so training continues exactly where it stopped — all
other settings are read back from the checkpoint's own args.
"""
import os

os.environ["YOLO_AUTOINSTALL"] = "false"

import torch
from ultralytics import YOLO

LAST = r"c:\Users\nwagb\Desktop\SponsorshipGlobalTalentPrep\PPE_Compliance_detection\notebooks\runs\detect\ppe_yolo11s_vboost_r3\weights\last.pt"


def main():
    torch.cuda.empty_cache()
    model = YOLO(LAST)
    model.train(resume=True)
    print("TRAINING COMPLETE")


if __name__ == "__main__":
    main()
