import sharp from "sharp";
import type { ErrorCode } from "../utils/errors.js";

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_WIDTH = 4000;
const MAX_HEIGHT = 4000;

const ACCEPTED_FORMATS = new Set(["jpeg", "png"]);

async function readMetadata(data: Buffer) {
  try {
    return await sharp(data).metadata();
  } catch {
    return null;
  }
}

export type ValidationResult =
  { valid: true } | { valid: false; code: ErrorCode; message: string };

export async function validateImage(data: Buffer): Promise<ValidationResult> {
  if (data.byteLength > MAX_FILE_SIZE) {
    return {
      valid: false,
      code: "INVALID_INPUT",
      message: `Image exceeds maximum file size of ${MAX_FILE_SIZE} bytes`,
    };
  }

  const metadata = await readMetadata(data);
  if (!metadata) {
    return {
      valid: false,
      code: "UNREADABLE_IMAGE",
      message: "Image data could not be read",
    };
  }

  const { format, width, height } = metadata;

  if (!format || !ACCEPTED_FORMATS.has(format)) {
    return {
      valid: false,
      code: "UNSUPPORTED_FILE_TYPE",
      message: `Unsupported image format: ${format ?? "unknown"}`,
    };
  }

  if (!width || !height) {
    return {
      valid: false,
      code: "UNREADABLE_IMAGE",
      message: "Image dimensions could not be determined",
    };
  }

  if (width > MAX_WIDTH || height > MAX_HEIGHT) {
    return {
      valid: false,
      code: "INVALID_INPUT",
      message: `Image dimensions ${width}x${height} exceed maximum of ${MAX_WIDTH}x${MAX_HEIGHT}`,
    };
  }

  return { valid: true };
}
