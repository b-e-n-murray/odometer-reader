import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interpretReading } from "../services/reading.js";
import type { OcrResult } from "../services/tesseract.js";

type Line = Array<[text: string, confidence: number]>;

/** Builds an OcrResult by hand, so scoring is tested without running OCR. */
function ocrOf(...lines: Line[]): OcrResult {
  const words = lines.flatMap((line, lineIndex) => {
    const lineText = line.map(([text]) => text).join(" ");

    return line.map(([text, confidence]) => ({
      text,
      confidence,
      lineIndex,
      lineText,
    }));
  });

  return {
    words,
    text: lines.map((line) => line.map(([text]) => text).join(" ")).join("\n"),
    confidence: 80,
  };
}

describe("interpretReading", () => {
  describe("candidate selection", () => {
    it("reads a lone six-digit figure", () => {
      const result = interpretReading(ocrOf([["205265", 92]]));

      assert.equal(result.found, true);
      assert.equal(result.reading, 205265);
    });

    it("prefers the odometer over a trip meter", () => {
      const result = interpretReading(
        ocrOf(
          [
            ["ODO", 88],
            ["161967", 90],
          ],
          [
            ["TRIP", 88],
            ["123.4", 90],
          ],
        ),
      );

      assert.equal(result.found, true);
      assert.equal(result.reading, 161967);
    });

    it("prefers the odometer over speedometer and rev counter markings", () => {
      const result = interpretReading(
        ocrOf(
          [
            ["20", 96],
            ["40", 96],
            ["60", 96],
            ["100", 96],
            ["140", 96],
          ],
          [
            ["ODO", 60],
            ["205265", 72],
          ],
          [
            ["x", 90],
            ["1000RPM", 90],
          ],
        ),
      );

      assert.equal(result.found, true);
      assert.equal(result.reading, 205265);
    });

    it("prefers the odometer over a range-to-empty readout", () => {
      const result = interpretReading(
        ocrOf(
          [
            ["104", 92],
            ["miles", 90],
          ],
          [
            ["154510", 88],
            ["miles", 90],
          ],
        ),
      );

      assert.equal(result.found, true);
      assert.equal(result.reading, 154510);
    });

    it("keeps the tenths shown by a display", () => {
      const result = interpretReading(
        ocrOf([
          ["62690.5", 91],
          ["mi", 80],
        ]),
      );

      assert.equal(result.found, true);
      assert.equal(result.reading, 62690.5);
    });

    it("reads a comma as a decimal point", () => {
      const result = interpretReading(ocrOf([["62690,5", 91]]));

      assert.equal(result.found, true);
      assert.equal(result.reading, 62690.5);
    });

    it("judges plausibility on the whole miles, not the tenths", () => {
      // Five whole digits plus a tenth is a plausible odometer; counting all
      // six characters as digits would flatter a four-digit reading.
      const result = interpretReading(ocrOf([["ODO", 90], ["62690.5", 91]]));

      assert.equal(result.found, true);
      assert.equal(result.confidence, "high");
    });
  });

  describe("no reading available", () => {
    it("reports nothing found when the image holds no digits", () => {
      assert.deepEqual(interpretReading(ocrOf([["UNLEADED", 90]])), {
        found: false,
      });
    });

    it("reports nothing found when no words were recognised", () => {
      assert.deepEqual(interpretReading(ocrOf()), { found: false });
    });
  });

  describe("confidence", () => {
    it("is high for a clear, well-recognised reading", () => {
      const result = interpretReading(
        ocrOf([
          ["ODO", 90],
          ["205265", 92],
        ]),
      );

      assert.equal(result.found, true);
      assert.equal(result.confidence, "high");
    });

    it("is low when the winning figure was poorly recognised", () => {
      const result = interpretReading(
        ocrOf([
          ["ODO", 30],
          ["205265", 32],
        ]),
      );

      assert.equal(result.found, true);
      assert.equal(result.confidence, "low");
    });

    it("is low when the only figure is too short to be mileage", () => {
      const result = interpretReading(ocrOf([["42", 95]]));

      assert.equal(result.found, true);
      assert.equal(result.confidence, "low");
    });

    it("is low when two equally plausible figures compete", () => {
      const result = interpretReading(
        ocrOf([["205265", 90]], [["161967", 90]]),
      );

      assert.equal(result.found, true);
      assert.equal(result.confidence, "low");
    });
  });
});
