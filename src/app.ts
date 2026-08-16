import http from "node:http";
import { URL } from "node:url";
import type { ErrorCode } from "./utils/errors.js";
import { STATUS_BY_CODE } from "./utils/errors.js";
import { extractImage } from "./services/extract.js";
import { validateImage } from "./services/validate-content.js";

const ODOMETER_READING_PATH = "/odometer/reading";

function sendResponse(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendErrorResponse(
  res: http.ServerResponse,
  code: ErrorCode,
  message: string,
) {
  sendResponse(res, STATUS_BY_CODE[code], { error: code, message });
}

export const app = http.createServer(async (req, res) => {
  const { method, url } = req;
  const parsedUrl = new URL(url ?? "/", "http://localhost");
  const pathname = parsedUrl.pathname;

  const validReq = handleMethodAndPathValidation(method, pathname, res);
  if (!validReq) {
    return;
  }

  const contentType = req.headers["content-type"] ?? "";
  const validContent = handleContentValidation(contentType, res);
  if (!validContent) {
    return;
  }

  const extraction = await extractImage(req, contentType);
  if (!extraction.ok) {
    sendErrorResponse(res, extraction.code, extraction.message);
    return;
  }

  const validation = await validateImage(extraction.data);
  if (!validation.valid) {
    sendErrorResponse(res, validation.code, validation.message);
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello Odometer enthusiast!\n");
});

function handleMethodAndPathValidation(
  method: string | undefined,
  path: string | undefined,
  res: http.ServerResponse,
): boolean {
  if (path !== ODOMETER_READING_PATH) {
    sendResponse(res, 404, {
      error: "NOT_FOUND",
      message: `Request path ${path} not recognised`,
    });
    return false;
  }

  if (method !== "POST") {
    sendResponse(res, 405, {
      error: "METHOD_NOT_ALLOWED",
      message: `Expected POST for ${path} path, got ${method}`,
    });
    return false;
  }

  return true;
}

function handleContentValidation(
  contentType: string,
  res: http.ServerResponse,
): boolean {
  const isMultipart = contentType.startsWith("multipart/form-data;");
  const isJson = contentType.startsWith("application/json");

  if (contentType == "" || (!isMultipart && !isJson)) {
    sendErrorResponse(
      res,
      "UNSUPPORTED_FILE_TYPE",
      `Unsupported content type: wanted multipart/form-data or application/json, got ${contentType}`,
    );
    return false;
  }

  return true;
}
