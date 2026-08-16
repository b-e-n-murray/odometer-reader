import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  MAX_FILE_SIZE,
  validateImage,
  type ValidationResult,
} from "../services/validate-content.js";

const FIXTURE_IMAGE = "33c24909-e9dd-46d3-8e7f-c44fd9896537.jpeg";

let fixture: Buffer;

before(async () => {
  fixture = await readFile(
    path.join(import.meta.dirname, "../../images", FIXTURE_IMAGE),
  );
});

function blankImage(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  });
}

function assertInvalid(result: ValidationResult, code: string) {
  assert.equal(result.valid, false);
  assert.equal(result.code, code);
  assert.ok(result.message.length > 0, "expected a non-empty message");
}

describe("validateImage", () => {
  describe("accepted images", () => {
    it("accepts a real JPEG photo", async () => {
      assert.deepEqual(await validateImage(fixture), { valid: true });
    });

    it("accepts a PNG", async () => {
      const png = await blankImage(10, 10).png().toBuffer();

      assert.deepEqual(await validateImage(png), { valid: true });
    });

    it("accepts an image at the maximum dimensions", async () => {
      const atLimit = await blankImage(4000, 4000).jpeg().toBuffer();

      assert.deepEqual(await validateImage(atLimit), { valid: true });
    });
  });

  describe("file size", () => {
    it("rejects data larger than the maximum file size", async () => {
      const oversized = Buffer.alloc(MAX_FILE_SIZE + 1);

      assertInvalid(await validateImage(oversized), "INVALID_INPUT");
    });

    it("does not reject data at exactly the maximum file size", async () => {
      // Zero-filled, so it fails the later decode step rather than the size
      // check - which is what proves the size limit itself is exclusive.
      const atLimit = Buffer.alloc(MAX_FILE_SIZE);

      assertInvalid(await validateImage(atLimit), "UNREADABLE_IMAGE");
    });
  });

  describe("decodability", () => {
    it("rejects data that is not an image", async () => {
      const junk = Buffer.from("definitely not an image");

      assertInvalid(await validateImage(junk), "UNREADABLE_IMAGE");
    });

    it("rejects an empty buffer", async () => {
      assertInvalid(await validateImage(Buffer.alloc(0)), "UNREADABLE_IMAGE");
    });

    it("rejects a truncated JPEG", async () => {
      const truncated = fixture.subarray(0, 32);

      assertInvalid(await validateImage(truncated), "UNREADABLE_IMAGE");
    });
  });

  describe("file format", () => {
    it("rejects a WEBP", async () => {
      const webp = await blankImage(10, 10).webp().toBuffer();

      assertInvalid(await validateImage(webp), "UNSUPPORTED_FILE_TYPE");
    });

    it("rejects a GIF", async () => {
      const gif = await blankImage(10, 10).gif().toBuffer();

      assertInvalid(await validateImage(gif), "UNSUPPORTED_FILE_TYPE");
    });
  });

  describe("dimensions", () => {
    it("rejects an image wider than the maximum", async () => {
      const tooWide = await blankImage(4001, 10).jpeg().toBuffer();

      assertInvalid(await validateImage(tooWide), "INVALID_INPUT");
    });

    it("rejects an image taller than the maximum", async () => {
      const tooTall = await blankImage(10, 4001).jpeg().toBuffer();

      assertInvalid(await validateImage(tooTall), "INVALID_INPUT");
    });
  });
});
