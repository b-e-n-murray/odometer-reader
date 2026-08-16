import path from "node:path";
import sharp from "sharp";
import { createWorker, OEM, PSM, type Worker } from "tesseract.js";
import type { ErrorCode } from "../utils/errors.js";
import { interpretReading, type ConfidenceLevel } from "./reading.js";

// Language data is downloaded on first use and cached here, rather than in the
// process working directory (tesseract.js's default).
const CACHE_PATH = path.join(import.meta.dirname, "../../.tesseract-cache");

export type OcrWord = {
  text: string;
  confidence: number;
  /** Index of the line this word was read from, for grouping. */
  lineIndex: number;
  /** Full text of that line, used for nearby-label signals. */
  lineText: string;
};

export type OcrResult = {
  words: OcrWord[];
  text: string;
  confidence: number;
};

let workerPromise: Promise<Worker> | null = null;

/**
 * Workers are expensive to start - they spawn a thread, instantiate WASM and
 * re-parse the language data - so one is created lazily and reused.
 */
function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker("eng", OEM.LSTM_ONLY, {
    cachePath: CACHE_PATH,
  }).then(async (worker) => {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK, // Matches typical display of mileage figure on odometer.
    });
    return worker;
  });

  return workerPromise;
}

export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;

  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}

const FULL_FRAME_WIDTH = 2160;
const BAND_WIDTH = 1800;
/** Proportion of the image height kept by the central band pass. */
const BAND_HEIGHT_RATIO = 0.5;

/**
 * Prepares the image for OCR in two ways: the full frame catches readouts sitting away from the
 * centre, while the band crops the surrounding dashboard away so the digits
 * survive upscaling. Their results are pooled and ranked downstream.
 */
async function preprocess(data: Buffer): Promise<Buffer[]> {
  const fullFrame = await sharp(data)
    .rotate()
    .grayscale()
    .normalise()
    .resize({ width: FULL_FRAME_WIDTH })
    .png()
    .toBuffer();

  // Band is cropped from an already-normalised image on purpose: levelling
  // the contrast across the whole dashboard reads better than levelling it
  // within the crop.
  const normalised = await sharp(data)
    .rotate()
    .grayscale()
    .normalise()
    .png()
    .toBuffer();
  const { width = 0, height = 0 } = await sharp(normalised).metadata();

  // Assume readings sit centrally and are wide and short, so the crop keeps the full
  // width - a square crop is narrower than the display and truncates digits.
  const bandHeight = Math.floor(height * BAND_HEIGHT_RATIO);
  const band = await sharp(normalised)
    .extract({
      left: 0,
      top: Math.floor((height - bandHeight) / 2),
      width,
      height: bandHeight,
    })
    .resize({ width: BAND_WIDTH })
    .png()
    .toBuffer();

  return [fullFrame, band];
}

export async function readImage(data: Buffer): Promise<OcrResult> {
  const worker = await getWorker();
  const passes = await preprocess(data);

  const words: OcrWord[] = [];
  const texts: string[] = [];
  const confidences: number[] = [];

  // A single running line index across both passes, so that words from
  // different passes are never treated as neighbours on the same line.
  let lineIndex = 0;

  for (const pass of passes) {
    // Word-level detail is opt-in; without `blocks` the result carries only
    // the page text and a single overall confidence.
    const { data: page } = await worker.recognize(pass, {}, { blocks: true });

    texts.push(page.text);
    confidences.push(page.confidence);

    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          for (const word of line.words) {
            words.push({
              text: word.text,
              confidence: word.confidence,
              lineIndex,
              lineText: line.text,
            });
          }
          lineIndex += 1;
        }
      }
    }
  }

  return {
    words,
    text: texts.join("\n"),
    confidence: Math.max(...confidences, 0),
  };
}

export type OdometerResult =
  | { ok: true; reading: number; confidence: ConfidenceLevel }
  | { ok: false; code: ErrorCode; message: string };

/**
 * Reads an image and interprets the mileage from it, pairing the OCR pass with
 * the candidate scoring in reading.ts.
 */
export async function extractOdometer(data: Buffer): Promise<OdometerResult> {
  let ocr: OcrResult;

  try {
    ocr = await readImage(data);
  } catch (error) {
    console.error("OCR failed:", error);
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      message: "Could not process the provided image",
    };
  }

  const reading = interpretReading(ocr);
  if (!reading.found) {
    return {
      ok: false,
      code: "UNREADABLE_IMAGE",
      message: "Could not extract a mileage reading from the provided image",
    };
  }

  return {
    ok: true,
    reading: reading.reading,
    confidence: reading.confidence,
  };
}
