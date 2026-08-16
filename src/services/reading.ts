import type { OcrResult, OcrWord } from "./tesseract.js";

export type ConfidenceLevel = "high" | "medium" | "low";

export type ReadingResult =
  | { found: true; reading: number; confidence: ConfidenceLevel }
  | { found: false };

/** Unrelated to the odometer - used to devalue unwanted candidates. */
const NON_ODOMETER_LABEL =
  /trip|avg|mpg|mph|km\s*\/?\s*h|rpm|range|to\s*e\b|fuel|gal|temp|psi|°/i;

/** Desireable labels - used to increase value of candidate. */
const ODOMETER_LABEL = /\bodo\b|odometer/i;

const NUMERIC_TOKEN = /\d+(?:[.,]\d+)?/g;

type Candidate = {
  /** The reading itself, tenths included where the display shows them. */
  value: number;
  /** Canonical text of the value, used to recognise duplicates. */
  key: string;
  /** Digits before any decimal point, which is what plausibility rests on. */
  // TODO: Could this, instead, be an indicator of mileage reading? Speedometer values never have decimal places.
  integerDigits: number;
  confidence: number;
  hasDecimal: boolean;
  lineText: string;
};

/**
 * How plausible a digit count is for an odometer. Deliberately a gradient
 * rather than a cut-off: a brand new car may read 000012, so short values are
 * ranked down rather than discarded.
 */
function digitCountScore(digitCount: number): number {
  switch (digitCount) {
    case 6:
      return 1;
    case 5:
      return 0.95;
    case 7:
      return 0.7;
    case 4:
      return 0.5;
    case 3:
      return 0.2;
    case 2:
      return 0.1;
    case 1:
      return 0.05;
    default:
      return 0.1;
  }
}

function scoreOf(candidate: Candidate): number {
  let score =
    1.6 * digitCountScore(candidate.integerDigits) +
    0.8 * (candidate.confidence / 100);

  if (ODOMETER_LABEL.test(candidate.lineText)) {
    score += 0.4;
  }

  if (NON_ODOMETER_LABEL.test(candidate.lineText)) {
    score -= 0.35;
  }

  return score;
}

function candidatesFromWord(word: OcrWord): Candidate[] {
  const tokens = word.text.match(NUMERIC_TOKEN) ?? [];

  return tokens.map((token) => {
    // OCR reports a decimal point as either separator depending on the font.
    const normalised = token.replace(",", ".");
    const [integerPart = ""] = normalised.split(".");

    return {
      value: Number(normalised),
      key: normalised,
      integerDigits: integerPart.length,
      confidence: word.confidence,
      hasDecimal: normalised.includes("."),
      lineText: word.lineText,
    };
  });
}

function confidenceLevel(best: Candidate, margin: number): ConfidenceLevel {
  const plausibleLength = best.integerDigits >= 5 && best.integerDigits <= 7;

  if (!plausibleLength) return "low";
  if (best.confidence >= 75 && margin >= 0.4) return "high";
  if (best.confidence >= 50 && margin >= 0.15) return "medium";
  return "low";
}

// Finds distinct numeric values from result and determines most likely mileage value through ranking.
export function interpretReading(ocr: OcrResult): ReadingResult {
  // Collect non-zero candidates
  const candidates = ocr.words
    .flatMap(candidatesFromWord)
    .filter(
      (candidate) =>
        candidate.integerDigits > 0 && !Number.isNaN(candidate.value),
    );

  if (candidates.length === 0) {
    return { found: false };
  }

  const ranked = candidates
    .map((candidate) => ({ candidate, score: scoreOf(candidate) }))
    .sort((a, b) => b.score - a.score);

  // Keep only best where duplicates present.
  // This can result from multiple passes during extraction.
  const seen = new Set<string>();
  const distinct = ranked.filter(({ candidate }) => {
    if (seen.has(candidate.key)) return false;
    seen.add(candidate.key);
    return true;
  });

  const [best, runnerUp] = distinct;
  if (!best) {
    return { found: false };
  }

  // A close second means the image is genuinely ambiguous, which is reported
  // as lower confidence rather than resolved by guesswork.
  const margin = best.score - (runnerUp?.score ?? 0);

  return {
    found: true,
    reading: best.candidate.value,
    confidence: confidenceLevel(best.candidate, margin),
  };
}
