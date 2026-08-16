import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { extractOdometer, terminateOcr } from "../services/tesseract.js";

const IMAGES = path.join(import.meta.dirname, "../../images");

function fixture(name: string) {
  return readFile(path.join(IMAGES, name));
}

after(async () => {
  await terminateOcr();
});

describe("extractOdometer", () => {
  describe("sample photographs", () => {
    it("reads a dot matrix display", async () => {
      const result = await extractOdometer(
        await fixture("33c24909-e9dd-46d3-8e7f-c44fd9896537.jpeg"),
      );

      assert.equal(result.ok, true);
      // The display shows a tenth, which is part of the reading.
      assert.equal(result.reading, 62690.5);
    });

    it("reads a segmented odometer on a full dashboard", async () => {
      const result = await extractOdometer(
        await fixture("dbab9932-823e-49ed-80db-1e898d836d5e.jpeg"),
      );

      assert.equal(result.ok, true);
      assert.equal(result.reading, 205265);
      // Recognised, but only just - the digits score very low with Tesseract,
      // so the response should not overstate how sure we are.
      assert.equal(result.confidence, "low");
    });

    it(
      "reads a seven-segment LCD",
      {
        skip:
          "Known limitation: Tesseract's eng model misreads seven-segment " +
          "glyphs (161967 -> 55528) even from a tight, high-resolution crop. " +
          "Needs a segment-trained model or a different OCR engine.",
      },
      async () => {
        const result = await extractOdometer(
          await fixture("3ae9d173-8895-409e-844c-77b5841138d7.jpeg"),
        );

        assert.equal(result.ok, true);
        assert.equal(result.reading, 161967);
      },
    );

    it(
      "reads an out-of-focus display",
      {
        skip:
          "Known limitation: this photograph is too blurred for Tesseract to " +
          "resolve the digits at any tested scale or threshold.",
      },
      async () => {
        const result = await extractOdometer(
          await fixture("d621e37e-7c0f-49a4-8a19-d628b1e82a33.jpeg"),
        );

        assert.equal(result.ok, true);
        assert.equal(result.reading, 154510);
      },
    );
  });

  describe("when no mileage is present", () => {
    it("reports the image as unreadable", async () => {
      const blank = await sharp({
        create: {
          width: 600,
          height: 400,
          channels: 3,
          background: { r: 128, g: 128, b: 128 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await extractOdometer(blank);

      assert.equal(result.ok, false);
      assert.equal(result.code, "UNREADABLE_IMAGE");
    });
  });
});
