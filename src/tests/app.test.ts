import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { app } from "../app.js";
import { terminateOcr } from "../services/tesseract.js";

const FIXTURE_IMAGE = "33c24909-e9dd-46d3-8e7f-c44fd9896537.jpeg";
const CONFIDENCE_LEVELS = ["high", "medium", "low"];

/**
 * Asserts the documented success shape. The reading itself is not pinned here -
 * OCR accuracy is measured in tesseract.test.ts, this covers the wiring.
 */
async function assertReadingResponse(res: Response) {
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/json");

  const body = await res.json();
  // Not asserted as a whole number: displays showing a tenth are reported as
  // such, so a reading may legitimately be fractional.
  assert.equal(typeof body.reading, "number");
  assert.ok(body.reading > 0, "reading should be positive");
  assert.equal(body.unit, "miles");
  assert.ok(
    CONFIDENCE_LEVELS.includes(body.confidence),
    `unexpected confidence: ${body.confidence}`,
  );
}

let baseUrl: string;
let odometerUrl: string;
let fixture: Buffer;

before(async () => {
  fixture = await readFile(
    path.join(import.meta.dirname, "../../images", FIXTURE_IMAGE),
  );

  app.listen(0, "localhost");

  // Wait until server has finished binding.
  await once(app, "listening");

  // Cast to AddressInfo to extract port.
  const { port } = app.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
  odometerUrl = `${baseUrl}/odometer/reading`;
});

after(async () => {
  app.close();
  await once(app, "close");

  // The OCR worker runs on its own thread and would keep the process alive.
  await terminateOcr();
});

function multipartBody(fieldName: string, data: Buffer, filename: string) {
  const form = new FormData();
  form.append(fieldName, new Blob([new Uint8Array(data)]), filename);
  return form;
}

function jsonBody(image: string) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  } satisfies RequestInit;
}

describe("POST /odometer/reading", () => {
  describe("routing", () => {
    it("returns 404 for an unrecognised path", async () => {
      const res = await fetch(`${baseUrl}/not/a/real/path`, { method: "POST" });

      assert.equal(res.status, 404);
      assert.equal((await res.json()).error, "NOT_FOUND");
    });

    it("returns 405 for a non-POST method on the reading path", async () => {
      const res = await fetch(odometerUrl);

      assert.equal(res.status, 405);
      assert.equal((await res.json()).error, "METHOD_NOT_ALLOWED");
    });
  });

  describe("content type validation", () => {
    it("returns 415 for an unsupported content type", async () => {
      const res = await fetch(odometerUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not an image",
      });

      assert.equal(res.status, 415);
      assert.equal((await res.json()).error, "UNSUPPORTED_FILE_TYPE");
    });

    it("returns 415 when no content type is supplied", async () => {
      const res = await fetch(odometerUrl, { method: "POST" });

      assert.equal(res.status, 415);
      assert.equal((await res.json()).error, "UNSUPPORTED_FILE_TYPE");
    });
  });

  describe("multipart/form-data uploads", () => {
    it("returns 200 for a valid image", async () => {
      const res = await fetch(odometerUrl, {
        method: "POST",
        body: multipartBody("image", fixture, FIXTURE_IMAGE),
      });

      await assertReadingResponse(res);
    });

    it("returns 400 when the upload has no parts at all", async () => {
      const res = await fetch(odometerUrl, {
        method: "POST",
        body: new FormData(),
      });

      assert.equal(res.status, 400);
      assert.equal((await res.json()).error, "MISSING_IMAGE");
    });

    it("returns 400 when the image file is empty", async () => {
      const res = await fetch(odometerUrl, {
        method: "POST",
        body: multipartBody("image", Buffer.alloc(0), FIXTURE_IMAGE),
      });

      assert.equal(res.status, 400);
      assert.equal((await res.json()).error, "MISSING_IMAGE");
    });

    it("returns 400 when the file uses a different field name", async () => {
      const res = await fetch(odometerUrl, {
        method: "POST",
        body: multipartBody("odometer", fixture, FIXTURE_IMAGE),
      });

      assert.equal(res.status, 400);
      assert.equal((await res.json()).error, "INVALID_INPUT");
    });

    it("returns 422 for an undecodable image", async () => {
      const res = await fetch(odometerUrl, {
        method: "POST",
        body: multipartBody("image", Buffer.from("not an image"), "junk.jpeg"),
      });

      assert.equal(res.status, 422);
      assert.equal((await res.json()).error, "UNREADABLE_IMAGE");
    });
  });

  describe("base64 JSON uploads", () => {
    it("returns 200 for a valid image", async () => {
      const res = await fetch(
        odometerUrl,
        jsonBody(fixture.toString("base64")),
      );

      await assertReadingResponse(res);
    });

    it("returns 200 for a valid data URI prefixed image", async () => {
      const res = await fetch(
        odometerUrl,
        jsonBody(`data:image/jpeg;base64,${fixture.toString("base64")}`),
      );

      await assertReadingResponse(res);
    });

    it("returns 400 when the image field is absent", async () => {
      const res = await fetch(odometerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notAnImage: "..." }),
      });

      assert.equal(res.status, 400);
      assert.equal((await res.json()).error, "MISSING_IMAGE");
    });

    it("returns 400 when the image field is empty", async () => {
      const res = await fetch(odometerUrl, jsonBody(""));

      assert.equal(res.status, 400);
      assert.equal((await res.json()).error, "MISSING_IMAGE");
    });

    it("returns 400 for a malformed JSON body", async () => {
      const res = await fetch(odometerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ not json",
      });

      assert.equal(res.status, 400);
      assert.equal((await res.json()).error, "INVALID_INPUT");
    });

    it("returns 422 for an undecodable image", async () => {
      const res = await fetch(
        odometerUrl,
        jsonBody(Buffer.from("not an image").toString("base64")),
      );

      assert.equal(res.status, 422);
      assert.equal((await res.json()).error, "UNREADABLE_IMAGE");
    });
  });
});
