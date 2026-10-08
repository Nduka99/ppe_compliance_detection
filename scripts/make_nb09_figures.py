"""Publication-quality figure suite for NB09 (vest-detection campaign).

Consistent theme across all figures; deliberately diverse forms:
  fig1 line  | fig2 horizontal bar | fig3 dumbbell
  fig4 stacked horizontal bar | fig5 connected scatter | fig6 small multiples
No dual-axis charts. Every series is direct-labelled as well as legended.
"""
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter

RESULTS = Path(__file__).resolve().parent.parent / "results"

# ---- theme (validated reference palette, light surface) ----
SURFACE = "#fcfcfb"
INK, INK2, MUTED = "#0b0b0b", "#52514e", "#898781"
GRID, AXIS = "#e1e0d9", "#c3c2b7"
BLUE, AQUA, YELLOW, GREEN, VIOLET, ORANGE = "#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#eb6834"
GOOD, BAD = "#006300", "#d03b3b"
MODEL_COLOR = {"Baseline": MUTED, "Round 1": ORANGE, "Round 2": YELLOW, "Round 3": BLUE}

plt.rcParams.update({
    "font.family": ["Segoe UI", "DejaVu Sans"], "font.size": 10,
    "text.color": INK, "axes.edgecolor": AXIS, "axes.labelcolor": INK2,
    "xtick.color": MUTED, "ytick.color": INK2,
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "axes.titlesize": 12, "axes.titlelocation": "left", "axes.titlepad": 14,
})


def despine(ax, keep=("bottom", "left")):
    for s in ["top", "right", "bottom", "left"]:
        ax.spines[s].set_visible(s in keep)


def save(fig, name):
    fig.savefig(RESULTS / name, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print("saved", name)


# ============================ data ============================
THRESH = [0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50]
RECALL = {
    "Baseline": [0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    "Round 2":  [34.1, 30.8, 27.6, 24.8, 21.5, 15.0, 11.2],
    "Round 3":  [57.9, 54.7, 52.8, 50.5, 50.5, 46.7, 42.5],
}
AT25 = {  # recall %, precision %, found/total
    "Baseline": (0.0, 0.0, 0, 214),
    "Round 2": (24.8, 88.3, 53, 214),
    "Round 3": (50.5, 80.0, 108, 214),
}
CLASSES = ["hardhat", "no-hardhat", "vest", "no-vest", "person"]
INDIST = {  # AP50 on the original test set
    "Baseline": [0.940, 0.966, 0.920, 0.921, 0.915],
    "Round 2":  [0.940, 0.965, 0.908, 0.877, 0.923],
    "Round 3":  [0.934, 0.965, 0.878, 0.872, 0.915],
}
INDIST_MAP50 = {"Baseline": 0.932, "Round 1": 0.919, "Round 2": 0.923, "Round 3": 0.913}
RW_RECALL_25 = {"Baseline": 0.0, "Round 2": 24.8, "Round 3": 50.5}

# training-set composition (images, and vest boxes contributed)
SOURCES = [
    ("Original train\n(3 merged PPE datasets)", 15480, 0),
    ("vest_boost\n(Roboflow safety-vests)", 3452, 6021),
    ("vest_boost2\n(hardhat+vest set)", 871, 21),
    ("vest_boost_sh17\n(SH17 train split)", 128, 313),
]

# ============================ fig 1: recall curve (line) ============================
fig, ax = plt.subplots(figsize=(8.8, 5))
for name, vals in RECALL.items():
    ax.plot(THRESH, vals, marker="o", ms=5.5, lw=2.2, color=MODEL_COLOR[name], label=name, zorder=3)
ax.axvline(0.25, color=AXIS, lw=1.1, ls=(0, (4, 4)), zorder=1)
ax.annotate("app default (0.25)", xy=(0.25, 62), xytext=(0.268, 62),
            fontsize=8.5, color=MUTED, va="center")
# direct labels, offset vertically so they never collide
for name, dy in (("Round 3", 2.5), ("Round 2", 2.0), ("Baseline", 2.2)):
    ax.annotate(name, xy=(THRESH[-1], RECALL[name][-1]), xytext=(THRESH[-1] + 0.012, RECALL[name][-1] + dy),
                fontsize=9.5, color=MODEL_COLOR[name], fontweight="bold", va="center")
ax.set_xlim(0.08, 0.575)
ax.set_ylim(-3, 66)
ax.set_xlabel("confidence threshold")
ax.set_ylabel("vest recall")
ax.yaxis.set_major_formatter(PercentFormatter())
ax.grid(axis="y", color=GRID, lw=0.8)
ax.set_axisbelow(True)
despine(ax)
ax.legend(frameon=False, fontsize=9.5, loc="upper right", bbox_to_anchor=(1.0, 0.97))
ax.set_title("Real-world vest recall vs confidence threshold\n"
             "84 held-out images · 214 human-labelled vests · never seen in training",
             color=INK)
save(fig, "nb09_fig1_realworld_recall_curve.png")

# ============================ fig 2: headline (horizontal bar) ============================
fig, ax = plt.subplots(figsize=(8.8, 3.4))
names = ["Baseline", "Round 2", "Round 3"]
ypos = range(len(names))
for y, n in zip(ypos, names):
    r = AT25[n][0]
    ax.barh(y, r, height=0.55, color=MODEL_COLOR[n], zorder=3)
    found, total = AT25[n][2], AT25[n][3]
    ax.annotate(f"{r:.1f}%   ({found} of {total} vests found)",
                xy=(r + 1.2, y), va="center", fontsize=10, color=INK2, zorder=4)
ax.set_yticks(list(ypos), names, fontsize=11)
ax.invert_yaxis()
ax.set_xlim(0, 78)
ax.set_xlabel("vest recall at the app's default confidence (0.25)")
ax.xaxis.set_major_formatter(PercentFormatter())
ax.grid(axis="x", color=GRID, lw=0.8)
ax.set_axisbelow(True)
despine(ax, keep=("bottom",))
ax.tick_params(axis="y", length=0)
ax.set_title("Headline: the deployed baseline detected no real-world vests at all", color=INK)
save(fig, "nb09_fig2_headline_bar.png")

# ============================ fig 3: class integrity (dumbbell) ============================
fig, ax = plt.subplots(figsize=(8.8, 4.6))
order = list(reversed(CLASSES))
for y, c in enumerate(order):
    i = CLASSES.index(c)
    b, r3 = INDIST["Baseline"][i], INDIST["Round 3"][i]
    ax.plot([b, r3], [y, y], color=GRID, lw=2.5, zorder=1, solid_capstyle="round")
    ax.scatter([b], [y], s=78, color=MUTED, zorder=3)
    ax.scatter([r3], [y], s=95, color=BLUE, zorder=4)
    d = r3 - b
    ax.annotate(f"{d:+.3f}", xy=(1.005, y), fontsize=9.5, va="center",
                color=GOOD if d >= -0.01 else BAD, fontweight="bold")
ax.set_yticks(range(len(order)), order, fontsize=10.5)
ax.set_xlim(0.855, 1.045)
ax.set_xticks([0.86, 0.88, 0.90, 0.92, 0.94, 0.96, 0.98, 1.00])
ax.set_xlabel("AP50 on the original held-out test set")
ax.grid(axis="x", color=GRID, lw=0.8)
ax.set_axisbelow(True)
despine(ax, keep=("bottom",))
ax.tick_params(axis="y", length=0)
handles = [plt.Line2D([], [], marker="o", ls="", ms=8, color=MUTED, label="Baseline"),
           plt.Line2D([], [], marker="o", ls="", ms=9, color=BLUE, label="Round 3 (deployed)")]
# legend below the plot so it can never crowd the bottom data row
ax.legend(handles=handles, frameon=False, fontsize=9.5, ncol=2,
          loc="upper center", bbox_to_anchor=(0.5, -0.16))
ax.set_title("Class integrity: hard-hat, no-hard-hat and person are preserved\n"
             "vest / no-vest dip here because this test set's vests are one narrow style",
             color=INK)
save(fig, "nb09_fig3_class_integrity.png")

# ============================ fig 4: data composition (stacked h-bar) ============================
fig, (axA, axB) = plt.subplots(1, 2, figsize=(11.5, 3.9))
labels = [s[0] for s in SOURCES]
imgs = [s[1] for s in SOURCES]
vests = [s[2] for s in SOURCES]
cols = [MUTED, BLUE, AQUA, VIOLET]
y = range(len(labels))
axA.barh(list(y), imgs, height=0.6, color=cols, zorder=3)
for i, v in enumerate(imgs):
    axA.annotate(f"{v:,}", xy=(v + 260, i), va="center", fontsize=9.5, color=INK2)
axA.set_yticks(list(y), labels, fontsize=9)
axA.invert_yaxis()
axA.set_xlim(0, 19500)
axA.set_xlabel("images in the training pool")
axA.grid(axis="x", color=GRID, lw=0.8)
axA.set_axisbelow(True)
despine(axA, keep=("bottom",))
axA.tick_params(axis="y", length=0)
axA.set_title("Training pool by source", color=INK, fontsize=11)

axB.barh(list(y), vests, height=0.6, color=cols, zorder=3)
for i, v in enumerate(vests):
    axB.annotate(f"{v:,}" if v else "0", xy=(v + 95, i), va="center", fontsize=9.5, color=INK2)
axB.set_yticks(list(y), ["" for _ in labels])
axB.invert_yaxis()
axB.set_xlim(0, 7200)
axB.set_xlabel("vest bounding boxes contributed")
axB.grid(axis="x", color=GRID, lw=0.8)
axB.set_axisbelow(True)
despine(axB, keep=("bottom",))
axB.tick_params(axis="y", length=0)
axB.set_title("Vest signal by source", color=INK, fontsize=11)
fig.suptitle("Where the vest training signal actually comes from", fontsize=12.5, color=INK,
             x=0.008, ha="left", y=1.06)
save(fig, "nb09_fig4_data_composition.png")

# ============================ fig 5: precision-recall trade (connected scatter) ============================
fig, ax = plt.subplots(figsize=(9.2, 5.0))
pts = [(AT25[n][0], AT25[n][1], n) for n in ["Baseline", "Round 2", "Round 3"]]
ax.plot([p[0] for p in pts[1:]], [p[1] for p in pts[1:]], color=GRID, lw=2, zorder=1)
# label placement chosen so no text crosses the connector line (which descends
# left->right) and nothing runs off the right edge
PLACE = {  # name: (dx, dy, ha)
    "Baseline": (2.2, 7.5, "left"),
    "Round 2": (0.0, 9.5, "center"),
    "Round 3": (0.0, -11.0, "center"),
}
for r, p, n in pts:
    ax.scatter([r], [p], s=150, color=MODEL_COLOR[n], zorder=3)
    dx, dy, ha = PLACE[n]
    ax.annotate(f"{n}\nrecall {r:.1f}% · precision {p:.0f}%",
                xy=(r, p), xytext=(r + dx, p + dy),
                fontsize=9.5, color=MODEL_COLOR[n], fontweight="bold",
                va="center", ha=ha)
ax.set_xlim(-8, 72)
ax.set_ylim(-14, 108)
ax.set_xlabel("vest recall (share of real vests found)")
ax.set_ylabel("vest precision (share of calls that are correct)")
ax.xaxis.set_major_formatter(PercentFormatter())
ax.yaxis.set_major_formatter(PercentFormatter())
ax.grid(color=GRID, lw=0.8)
ax.set_axisbelow(True)
despine(ax)
ax.set_title("The trade we accepted: round 3 doubles recall for 8 points of precision\n"
             "at the app's default confidence of 0.25", color=INK)
save(fig, "nb09_fig5_precision_recall.png")

# ============================ fig 6: why the proxy metric misled (small multiples) ============================
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11.5, 4.3))
rounds = ["Baseline", "Round 2", "Round 3"]
xs = range(len(rounds))

vals1 = [INDIST_MAP50[r] for r in rounds]
ax1.plot(list(xs), vals1, marker="o", ms=9, lw=2.4, color=BAD, zorder=3)
for x, v in zip(xs, vals1):
    ax1.annotate(f"{v:.3f}", xy=(x, v + 0.004), ha="center", fontsize=9.5, color=INK2)
ax1.set_xticks(list(xs), rounds, fontsize=10)
ax1.set_ylim(0.900, 0.945)
ax1.set_ylabel("mAP50 (original test set)")
ax1.grid(axis="y", color=GRID, lw=0.8)
ax1.set_axisbelow(True)
despine(ax1)
ax1.set_title("Proxy metric says: getting worse", color=BAD, fontsize=11)

vals2 = [RW_RECALL_25[r] for r in rounds]
ax2.plot(list(xs), vals2, marker="o", ms=9, lw=2.4, color=GOOD, zorder=3)
# offset labels left/above the ascending line so the stroke never crosses text
for x, v in zip(xs, vals2):
    ax2.annotate(f"{v:.1f}%", xy=(x - 0.06, v + 4.2), ha="right" if x else "left",
                 fontsize=9.5, color=INK2)
ax2.set_xticks(list(xs), rounds, fontsize=10)
ax2.set_ylim(-4, 62)
ax2.set_ylabel("real-world vest recall")
ax2.yaxis.set_major_formatter(PercentFormatter())
ax2.grid(axis="y", color=GRID, lw=0.8)
ax2.set_axisbelow(True)
despine(ax2)
ax2.set_title("Goal metric says: transformed", color=GOOD, fontsize=11)

fig.suptitle("Why we changed how we measure — the two metrics disagree by design",
             fontsize=12.5, color=INK, x=0.008, ha="left", y=1.04)
save(fig, "nb09_fig6_metric_divergence.png")

print("\nall figures written")
