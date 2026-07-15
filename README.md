# Exercise: Odometer Reading Service

## Overview

**Estimated time:** 3–4 hours

Please don't spend more than that. We respect your time and will evaluate accordingly.

At Just Insure, we offer pay-per-mile car insurance. One of the ways we verify a customer's mileage is by asking them to submit a photo of their odometer. To process these at scale, we need a service that can automatically extract the mileage reading from an image.

This is a real problem we've solved at Just. Your task is to build a small service that does the same thing.

---

## The Task

Build a Node.js HTTP service in TypeScript with a single endpoint:

```
POST /odometer/reading
```

The endpoint should:

- Accept an image (JPEG or PNG) of a car odometer
- Return the mileage reading extracted from the image
- Handle cases where the reading cannot be determined

### Success Response

```json
{
  "reading": 48253,
  "unit": "miles",
  "confidence": "high"
}
```

### Unreadable Image Response

```json
{
  "error": "UNREADABLE_IMAGE",
  "message": "Could not extract a mileage reading from the provided image"
}
```

---

## Requirements

### Functional Requirements

- Accept image uploads via:
    - `multipart/form-data`, or
    - Base64-encoded image in a JSON payload
- Extract the numeric odometer reading from the image
- Return a structured JSON response
- Handle error cases gracefully:
    - Missing image
    - Unsupported file type
    - Unreadable image
    - Other invalid inputs

### Non-Functional Requirements

- Written in TypeScript with strict mode enabled
- Include tests
- Include a README with setup instructions

### OCR Approach

Use any OCR solution you think is appropriate.

If your chosen approach requires credentials:

- Include clear setup instructions
- Provide a mock/stub mode so we can evaluate the service without creating an account

---

## Test Images

A set of odometer images is included in the `/images` folder of the base repository.

Clone the repository to get started:

```bash
git clone https://github.com/just-insure/backend-exercise-odometer.git
```

---

## What to Submit

Provide a folder or repository link containing:

- Service source code
- Tests
- README with setup instructions
- A copy of your chat with Claude (or a similar AI assistant)

Using AI such as Claude for this task is completely fine, and we ask that you include a copy of your chat/conversation with the AI assistant as part of your submission.

To be clear about why: we want to see how you think about a problem, and how you work with an agent. We're interested in how you use AI to help *yourself* think through a problem.

---

## How We'll Evaluate Your Submission

We are not looking for a production-ready system.

We are evaluating:

- How you think through problems
- How you structure code
- How you communicate technical decisions

---

## Questions?

If anything is unclear, please contact:

[**vitalij@just.insure**](mailto:vitalij@just.insure)

We'd rather you ask than make assumptions.
