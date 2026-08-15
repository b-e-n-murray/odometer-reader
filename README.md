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
  - The project currently supports files of up to ..., due to the capabilities of ... To support a wider range of customers, with differing camera-qualities, we might consider improving this by ...

- Support for other distance measurements
  - Are there any states/countries which use km? We may need to extend this in future to support more users.

- Confidence calculation
  - ...

- HTTP vs HTTPS?
