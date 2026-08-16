import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import type { IncomingMessage } from "node:http";
import { extractImage, type ExtractionResult } from "../services/extract.js";
import { MAX_FILE_SIZE } from "../services/validate-content.js";

const FIXTURE_IMAGE = "33c24909-e9dd-46d3-8e7f-c44fd9896537.jpeg";
const JSON_CONTENT_TYPE = "application/json";

const MAX_JSON_BODY_SIZE = MAX_FILE_SIZE * 2;

let fixture: Buffer;

before(async () => {
  fixture = await readFile(
    path.join(import.meta.dirname, "../../images", FIXTURE_IMAGE),
  );
});

// extractImage only pipes the request and listens for its "error" event, so a
// plain Readable stands in for a real IncomingMessage.
function fakeRequest(chunks: Buffer[]): IncomingMessage {
  return Readable.from(chunks) as unknown as IncomingMessage;
}

function jsonRequest(body: string): IncomingMessage {
  return fakeRequest([Buffer.from(body)]);
}

// Builds a real multipart body using the standard-library encoder, so the
// boundary and part headers match what a browser would actually send.
async function multipartRequest(
  files: Array<[field: string, data: Buffer]>,
  fields: Array<[field: string, value: string]> = [],
) {
  const form = new FormData();
  for (const [field, data] of files) {
    form.append(field, new Blob([new Uint8Array(data)]), FIXTURE_IMAGE);
  }
  // Appended last, so these also cover a trailing part arriving after the
  // image has already been read.
  for (const [field, value] of fields) {
    form.append(field, value);
  }

  const request = new Request("http://localhost/odometer/reading", {
    method: "POST",
    body: form,
  });

  const contentType = request.headers.get("content-type");
  assert.ok(contentType, "expected FormData to set a content type");

  const encoded = Buffer.from(await request.arrayBuffer());

  return { req: fakeRequest([encoded]), contentType };
}

function assertFailed(
  result: ExtractionResult,
  code: string,
): asserts result is Extract<ExtractionResult, { ok: false }> {
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
  assert.ok(result.message.length > 0, "expected a non-empty message");
}

function assertExtracted(result: ExtractionResult, expected: Buffer) {
  assert.equal(result.ok, true);
  assert.ok(result.data.equals(expected), "extracted bytes did not match");
}

describe("extractImage", () => {
  describe("base64 JSON payloads", () => {
    it("extracts a base64 encoded image", async () => {
      const body = JSON.stringify({ image: fixture.toString("base64") });

      const result = await extractImage(jsonRequest(body), JSON_CONTENT_TYPE);

      assertExtracted(result, fixture);
    });

    it("strips a data URI prefix before decoding", async () => {
      const body = JSON.stringify({
        image: `data:image/jpeg;base64,${fixture.toString("base64")}`,
      });

      const result = await extractImage(jsonRequest(body), JSON_CONTENT_TYPE);

      assertExtracted(result, fixture);
    });

    it("rejects a body with no image field", async () => {
      const result = await extractImage(
        jsonRequest(JSON.stringify({ odometer: "..." })),
        JSON_CONTENT_TYPE,
      );

      assertFailed(result, "MISSING_IMAGE");
    });

    it("rejects an empty image field", async () => {
      const result = await extractImage(
        jsonRequest(JSON.stringify({ image: "" })),
        JSON_CONTENT_TYPE,
      );

      assertFailed(result, "MISSING_IMAGE");
    });

    it("rejects a non-string image field", async () => {
      const result = await extractImage(
        jsonRequest(JSON.stringify({ image: 12345 })),
        JSON_CONTENT_TYPE,
      );

      assertFailed(result, "MISSING_IMAGE");
    });

    it("rejects a JSON body that is not an object", async () => {
      const result = await extractImage(jsonRequest("[]"), JSON_CONTENT_TYPE);

      assertFailed(result, "MISSING_IMAGE");
    });

    it("rejects base64 that decodes to nothing", async () => {
      // Buffer.from ignores invalid base64 characters rather than throwing,
      // so this yields a zero-length buffer.
      const result = await extractImage(
        jsonRequest(JSON.stringify({ image: "!!!!" })),
        JSON_CONTENT_TYPE,
      );

      assertFailed(result, "MISSING_IMAGE");
    });

    it("rejects a malformed JSON body", async () => {
      const result = await extractImage(
        jsonRequest("{ not valid json"),
        JSON_CONTENT_TYPE,
      );

      assertFailed(result, "INVALID_INPUT");
    });

    it("rejects a body larger than the maximum", async () => {
      const oversized = fakeRequest([Buffer.alloc(MAX_JSON_BODY_SIZE + 1)]);

      const result = await extractImage(oversized, JSON_CONTENT_TYPE);

      assertFailed(result, "INVALID_INPUT");
    });

    it("rejects a body carrying fields other than the image", async () => {
      const body = JSON.stringify({
        image: fixture.toString("base64"),
        unit: "miles",
      });

      const result = await extractImage(jsonRequest(body), JSON_CONTENT_TYPE);

      assertFailed(result, "INVALID_INPUT");
      assert.match(result.message, /unit/);
    });
  });

  describe("multipart/form-data uploads", () => {
    it("extracts a file from the image field", async () => {
      const { req, contentType } = await multipartRequest([["image", fixture]]);

      assertExtracted(await extractImage(req, contentType), fixture);
    });

    it("rejects an upload with no parts at all", async () => {
      const { req, contentType } = await multipartRequest([]);

      assertFailed(await extractImage(req, contentType), "MISSING_IMAGE");
    });

    it("rejects an upload where the file uses a different field name", async () => {
      const { req, contentType } = await multipartRequest([
        ["odometer", fixture],
      ]);

      const result = await extractImage(req, contentType);

      assertFailed(result, "INVALID_INPUT");
      assert.match(result.message, /odometer/);
    });

    it("rejects an empty file sent under the image field", async () => {
      const { req, contentType } = await multipartRequest([
        ["image", Buffer.alloc(0)],
      ]);

      assertFailed(await extractImage(req, contentType), "MISSING_IMAGE");
    });

    it("rejects a second file sent under the image field", async () => {
      const { req, contentType } = await multipartRequest([
        ["image", fixture],
        ["image", Buffer.from("a different file")],
      ]);

      assertFailed(await extractImage(req, contentType), "INVALID_INPUT");
    });

    it("rejects a second file sent under any other field name", async () => {
      const { req, contentType } = await multipartRequest([
        ["image", fixture],
        ["odometer", Buffer.from("a different file")],
      ]);

      assertFailed(await extractImage(req, contentType), "INVALID_INPUT");
    });

    it("rejects a text field sent alongside the image", async () => {
      const { req, contentType } = await multipartRequest(
        [["image", fixture]],
        [["unit", "miles"]],
      );

      const result = await extractImage(req, contentType);

      assertFailed(result, "INVALID_INPUT");
      assert.match(result.message, /unit/);
    });

    it("rejects a text field sent on its own", async () => {
      const { req, contentType } = await multipartRequest(
        [],
        [["unit", "miles"]],
      );

      assertFailed(await extractImage(req, contentType), "INVALID_INPUT");
    });

    it("rejects a file larger than the maximum", async () => {
      const oversized = Buffer.alloc(MAX_FILE_SIZE + 1024);
      const { req, contentType } = await multipartRequest([
        ["image", oversized],
      ]);

      assertFailed(await extractImage(req, contentType), "INVALID_INPUT");
    });

    it("rejects a malformed multipart body", async () => {
      const req = fakeRequest([Buffer.from("nowhere near a multipart body")]);

      const result = await extractImage(
        req,
        "multipart/form-data; boundary=----nonsense",
      );

      assertFailed(result, "INVALID_INPUT");
    });
  });
});
