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
git clone <repository-url>
cd <project-directory>
npm install
```

### Build and run

Compile the TypeScript source:

```bash
npm run build
npm start
```

The server will be available at: http://localhost:3000/

> **Note:** the first request (or first test run) downloads the Tesseract
> English language data and caches it in `.tesseract-cache/`, so it needs
> network access once. Every run after that works offline.

#### Example request

```sh
curl -i -X POST -H "Content-Type: multipart/form-data" -F "image=@images/33c24909-e9dd-46d3-8e7f-c44fd9896537.jpeg" http://localhost:3000/odometer/reading
```

### Running the tests

From the root of the project:

```sh
npm test
```

## Further considerations

- File size
  - A tentative upper bound is in place for now. The right limit is really
    a resolution question — odometer digits need to be legible to the OCR
    engine — so this will likely need revisiting once we have real
    accuracy data at different resolutions/file sizes.

- Support for other distance measurements
  - The majority of cars in the UK/US use miles, so this is the initial
    assumption. Expanding to km-based odometers may be difficult, since
    not all odometers display their unit (mi/km) on the display itself —
    detecting this reliably from the image alone is an open problem.

- Confidence calculation
  - Based on the OCR engine's (Tesseract.js) per-word confidence score,
    supplemented with domain-specific checks (e.g. plausible digit count/
    format for an odometer reading).

- OCR accuracy
  - Against the four sample photographs, the service currently reads 2 of 4
    correctly. The two failures are instructive rather than incidental:
    - **Seven-segment LCDs.** Tesseract's `eng` model is trained on printed
      prose and misreads segmented glyphs — one sample reads `55528` instead
      of `161967` even from a tight, high-resolution crop, so this is not a
      preprocessing problem. A segment-trained model (e.g. `letsgodigital`)
      or a cloud OCR engine would be the fix.
    - **Out-of-focus photographs.** No amount of scaling or thresholding
      recovers digits that were never resolved by the camera. Guidance at
      the point of capture would be more effective than processing.
  - Both cases are covered by skipped tests naming the limitation, so they
    become live the moment the engine improves.

- OCR performance
  - Recognition is CPU-bound and runs two passes per image (full frame plus a
    central band), taking roughly 2–7 seconds per request. A single Node
    process will serialise on this, so a worker pool or a queue-backed worker
    service is the obvious next step if throughput matters.

- HTTP vs HTTPS?

## Future improvements

- Accuracy
  - Replace Tesseract?
- Speed
- Extend to handle other units of distance
