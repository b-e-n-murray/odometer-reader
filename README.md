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

 Running the tests


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

- HTTP vs HTTPS?
