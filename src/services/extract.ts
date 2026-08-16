import type { IncomingMessage } from "node:http";
import Busboy from "busboy";
import type { ErrorCode } from "../utils/errors.js";
import { MAX_FILE_SIZE } from "./validate-content.js";

const IMAGE_FIELD_NAME = "image";
const MAX_JSON_BODY_SIZE = MAX_FILE_SIZE * 2; // buffer for base64 + JSON overhead - 10MB.

export type ExtractionResult =
  { ok: true; data: Buffer } | { ok: false; code: ErrorCode; message: string };

export function extractImage(
  req: IncomingMessage,
  contentType: string,
): Promise<ExtractionResult> {
  if (contentType.startsWith("multipart/form-data")) {
    return extractFromMultipart(req, contentType);
  }
  return extractFromJson(req);
}

function extractFromMultipart(
  req: IncomingMessage,
  contentType: string,
): Promise<ExtractionResult> {
  return new Promise((resolve) => {
    const busboy = Busboy({
      headers: { "content-type": contentType },
      limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    });

    let settled = false;
    let imageFound = false;

    const settle = (result: ExtractionResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    busboy.on("file", (fieldName, file) => {
      if (fieldName !== IMAGE_FIELD_NAME || imageFound) {
        file.resume(); // must drain every file stream, even ones we discard
        return;
      }
      imageFound = true;

      const chunks: Buffer[] = [];
      file.on("data", (chunk: Buffer) => chunks.push(chunk));

      file.on("close", () => {
        if (file.truncated) {
          settle({
            ok: false,
            code: "INVALID_INPUT",
            message: `Image exceeds maximum file size of ${MAX_FILE_SIZE} bytes`,
          });
          return;
        }
        settle({ ok: true, data: Buffer.concat(chunks) });
      });
    });

    busboy.on("error", (err) => {
      settle({
        ok: false,
        code: "INVALID_INPUT",
        message: `Malformed multipart body: ${(err as Error).message}`,
      });
    });

    busboy.on("close", () => {
      if (!imageFound) {
        settle({
          ok: false,
          code: "MISSING_IMAGE",
          message: `No file found in "${IMAGE_FIELD_NAME}" field`,
        });
      }
    });

    req.on("error", () => {
      settle({
        ok: false,
        code: "INVALID_INPUT",
        message: "Error reading request body",
      });
    });

    req.pipe(busboy);
  });
}

async function extractFromJson(
  req: IncomingMessage,
): Promise<ExtractionResult> {
  const body = await readBody(req, MAX_JSON_BODY_SIZE);
  if (!body.ok) return body;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.data.toString("utf-8"));
  } catch {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Request body is not valid JSON",
    };
  }

  const image =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)[IMAGE_FIELD_NAME]
      : undefined;

  if (typeof image !== "string" || image.length === 0) {
    return {
      ok: false,
      code: "MISSING_IMAGE",
      message: `Request body must include a base64-encoded "${IMAGE_FIELD_NAME}" field`,
    };
  }

  // Turn client-supplied base64 string into raw image bytes.
  const base64 = image.replace(/^data:[^;]+;base64,/, ""); // Remove potential "data:" prefix.
  const data = Buffer.from(base64, "base64");

  if (data.byteLength === 0) {
    return {
      ok: false,
      code: "MISSING_IMAGE",
      message: `"${IMAGE_FIELD_NAME}" field was empty`,
    };
  }

  return { ok: true, data };
}

type BodyReadResult =
  | { ok: true; data: Buffer }
  | { ok: false; code: "INVALID_INPUT"; message: string };

function readBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<BodyReadResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const settle = (result: BodyReadResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    // "data" event fires each time a chunk arrives off the socket.
    // Supports continous stream flow instead of manual .read() calls.
    req.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > maxBytes) {
        settle({
          ok: false,
          code: "INVALID_INPUT",
          message: "Request body too large",
        });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => settle({ ok: true, data: Buffer.concat(chunks) }));
    req.on("error", () =>
      settle({
        ok: false,
        code: "INVALID_INPUT",
        message: "Error reading request body",
      }),
    );
  });
}
