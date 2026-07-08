const LABELS = {
  hardhat: "Hard hat",
  "no-hardhat": "Missing hard hat",
  vest: "Safety vest",
  "no-vest": "Missing vest",
  person: "Worker",
};

export function prettyLabel(label) {
  return LABELS[label] ?? label;
}
