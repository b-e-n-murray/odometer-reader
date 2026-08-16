# Odometer Reading Service

This repository houses a fully-automated, image processing service which receives JPEG/PNG images of odometers and extracts mileage data.

The intent of this project is to support the efficient processing of odometer data for our customers, relieving them of the responsibility of manually entering this information, which can be slower and has potential for human-error.

## Running the service

### Prerequisites

- Node.js 22 or later
- npm

### Installation

Clone the repository and install dependencies:

```bash
git clone git@github.com:b-e-n-murray/odometer-reader.git
npm install # From root of repo
```

### Build and run

```bash
npm run build
npm start
```

The server will be available at: http://localhost:3000/

> **Note:** the first request (or first test run) downloads the Tesseract
> English language data and caches it in `.tesseract-cache/`, so it needs
> network access once. Every run after that works offline.

### Running the tests

```sh
npm test
```

65 tests, of which 2 are skipped — these are the known OCR limitations
described under [OCR accuracy](#ocr-accuracy), kept as documented failing
cases rather than deleted.

## API

`POST /odometer/reading` — the only route. An image may be sent in either of
two ways.

**Multipart upload**, as a single `image` file part:

```sh
curl -i -X POST -F "image=@images/33c24909-e9dd-46d3-8e7f-c44fd9896537.jpeg" \
  http://localhost:3000/odometer/reading
```

**JSON**, as a base64-encoded `image` field (a `data:` URI prefix is accepted
and stripped):

```sh
curl -i -X POST -H "Content-Type: application/json" \
  -d "{\"image\":\"$(base64 -w0 images/33c24909-e9dd-46d3-8e7f-c44fd9896537.jpeg)\"}" \
  http://localhost:3000/odometer/reading
```

Both return:

```json
{ "reading": 62690.5, "unit": "miles", "confidence": "medium" }
```

Tenths are included where the display shows them. `unit` is always `miles`
for now — see [considerations](#support-for-other-distance-measurements).

### Confidence

The service reports how much to trust a reading rather than presenting every
result as equally certain. The level combines the OCR score for the winning
digits, whether the digit count is plausible for an odometer (5–7), and the
margin over the runner-up candidate:

| Level    | Meaning                                                                  |
| -------- | ------------------------------------------------------------------------ |
| `high`   | Plausible length, strong OCR score, and a clear winner                   |
| `medium` | Plausible length, with a moderate score or a narrower margin             |
| `low`    | Implausible digit count, weak OCR, or a close runner-up — i.e. ambiguous |

A close second place is reported as lower confidence rather than resolved by
guesswork.

### Errors

Errors share one shape:

```json
{ "error": "UNREADABLE_IMAGE", "message": "Image data could not be read" }
```

| Code                    | Status | Raised when                                                        |
| ----------------------- | ------ | ------------------------------------------------------------------ |
| `MISSING_IMAGE`         | 400    | No `image` part/field, or it was empty                             |
| `INVALID_INPUT`         | 400    | Malformed body, unexpected fields, too large, or too big in pixels |
| `NOT_FOUND`             | 404    | Path other than `/odometer/reading`                                |
| `METHOD_NOT_ALLOWED`    | 405    | Non-`POST` method on the reading path                              |
| `UNSUPPORTED_FILE_TYPE` | 415    | Content type isn't multipart/JSON, or image isn't JPEG/PNG         |
| `UNREADABLE_IMAGE`      | 422    | Decodable image, but no mileage could be read from it              |
| `INTERNAL_ERROR`        | 500    | Unexpected failure                                                 |

The 415/422 split is deliberate: 415 means "we won't read this kind of thing",
422 means "we tried and couldn't".

## Design

Request handling is a three-stage pipeline, each stage a separate service
returning a discriminated result rather than throwing:

1. [`extract`](src/services/extract.ts) — pulls image bytes from either
   transport, streaming multipart through busboy with a size limit applied
   during the read rather than after it.
2. [`validate-content`](src/services/validate-content.ts) — confirms via sharp
   that the bytes really are a JPEG/PNG within size and dimension bounds,
   rather than trusting the declared content type.
3. [`tesseract`](src/services/tesseract.ts) + [`reading`](src/services/reading.ts)
   — OCR over two passes (full frame plus a central band), then candidate
   scoring to pick the mileage out of everything else on the dashboard.

Built on `node:http` with no web framework: the routing surface is a single
route, so a framework would add dependency weight without removing any code.

[project-plan.md](./project-plan.md) covers the reasoning behind the candidate
scoring in more depth — in particular why the plausibility signals are soft
and tie-breaking rather than hard filters.

### Sample images

The four photographs in [images/](./images/) cover the display types worth
testing against:

| Image        | Display                   | Status                                    |
| ------------ | ------------------------- | ----------------------------------------- |
| `33c24909-…` | Dot matrix                | Read correctly (`62690.5`)                |
| `dbab9932-…` | Segmented, full dashboard | Read correctly (`205265`), low confidence |
| `3ae9d173-…` | Seven-segment LCD         | Misread — see below                       |
| `d621e37e-…` | Out of focus              | Misread — see below                       |

## Considerations/future improvements

### OCR accuracy

Against the four sample photographs, the service currently reads 2 of 4
correctly. Both failures are limitations of the engine rather than incidental
bugs, and both are held as skipped tests with their reasons recorded:

- **Seven-segment LCDs.** Tesseract's `eng` model is trained on printed prose
  and misreads segmented glyphs — one sample reads `55528` instead of `161967`
  even from a tight, high-resolution crop, so this is not a preprocessing
  problem. A segment-trained model (e.g. `letsgodigital`) or a cloud OCR engine
  would be the fix.
- **Out-of-focus photographs.** One sample is too blurred for Tesseract to
  resolve the digits at any scale or threshold tested. Realistically this wants
  either a sharpness pre-check that asks the user to retake the photo, or an
  engine more tolerant of blur.

### OCR performance

Recognition is CPU-bound and runs two passes per image, taking roughly 2–7
seconds per request. Nothing currently bounds concurrency, so under real load
this would want a worker pool and a request timeout — and likely an async
job/callback shape rather than holding the connection open.

### File size

A tentative upper bound of 5MB is in place for now. The right limit is really
a resolution question — odometer digits need to be legible to the OCR
engine — so this will likely need revisiting once we have real accuracy data
at different resolutions/file sizes.

### Support for other distance measurements

The majority of cars in the UK/US use miles, so this is the initial
assumption. Expanding to km-based odometers may be difficult, since not all
odometers display their unit (mi/km) on the display itself — detecting this
reliably from the image alone is an open problem.

## AI usage

A full transcript of the conversation during the build of this project is
included:

- [Markdown transcript](./session-notes.md) — readable version
- [Raw JSONL](./session-notes.jsonl) — complete session log (10MB)
