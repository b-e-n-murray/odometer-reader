# Odometer Reading Service — Project Plan

Created early in project to document requirements and initial approach.

## Requirements

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

### Response specs

Success:

```json
{
  "reading": 48253,
  "unit": "miles",
  "confidence": "high"
}
```

Error:

```json
{
  "error": "UNREADABLE_IMAGE",
  "message": "Could not extract a mileage reading from the provided image"
}
```

## Current approach

- Use **Tesseract.js** for the first implementation of OCR
- Three core sub-services, invoked in order by the endpoint:
  1. Validation
  2. OCR
  3. Confidence calculator
- Confidence score to be based on Tesseract.js's per-word confidence,
  supplemented with domain-specific checks (e.g. digit count/format
  plausibility)
- OCR will surface multiple numeric candidates from a single image (trip
  meter, speed, clock, warning icons, etc.). Rather than hard-filtering on
  rules that don't hold for every case (e.g. brand-new cars may show
  leading zero-padded placeholder digits, so a fixed digit-count range
  isn't reliable; trip-meter labels aren't consistent enough to depend
  on), these are used as **soft, tie-breaking signals** rather than
  exclusion rules:
  - Prefer a contiguous digit run without a decimal point over one with
  - Deprioritise (don't discard) candidates near likely exclusion
    keywords (`trip`, `avg`, `mph`, `km/h`) where present
  - Prefer the candidate with the highest OCR confidence
  - If multiple candidates remain closely matched after this, treat the
    result as ambiguous and reflect that as lower confidence rather than
    guessing which one is correct

## Current unknowns

- **File size constraint** — a tentative upper bound for now; may need to
  consider resolution requirements more closely
- **Units vs miles** — the majority of cars in the UK/US use miles. Could
  we expand for km odometers? From the example images, this may be
  difficult, as not all meters display the unit (mi/km).

## Important considerations

- Using DDD where suitable
- Comprehensive testing
- Designing with scale and future expansion of the service in mind
