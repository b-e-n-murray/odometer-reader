# Claude Code Session

_Converted from: `89bc5a72-6646-421e-975b-cc2e621e2ae0.jsonl`_

## You

<ide_opened_file>The user opened the file /home/ben-murray/dev/projects/backend-exercise-odometer/README.md in the IDE. This may or may not be related to the current task.</ide_opened_file>
Hey Claude, I would like to build a Node.js + Typescript project; a single-endpoint API that accepts a JPEG/PNG (ideally of a car odometer) and uses OCR to extract and return the mileage displayed in the image.

Here are the requirements:

- Accept image uploads via:
  multipart/form-data, or
  Base64-encoded image in a JSON payload
- Extract the numeric odometer reading from the image
- Return a structured JSON response
- Handle error cases gracefully:
  Missing image
  Unsupported file type
  Unreadable image
  Other invalid inputs

Response specs:

```
{
  "reading": 48253,
  "unit": "miles",
  "confidence": "high"
}
```

```
{
  "error": "UNREADABLE_IMAGE",
  "message": "Could not extract a mileage reading from the provided image"
}
```

My current thoughts on how to approach this:

- Use an OCR package to handle the heavy-lifting
- Three core sub-services: validation, OCR, confidence calculator. Endpoint will employ each of these in this order.

Current unknowns:

- OCR package options and best choice
- File size constraint (may be dependant on above, but performance at scale is also a concern)
- How to determine confidence level. This may influence OCR package choice - if package has a concept of confidence or judgment quality, this could be a deciding factor.
- How to handle duplicate image uploads? Is caching/persistence appropriate for this service?

Important considerations

- Using DDD where suitable
- Comprehensive testing
- Designing with scale and future expansion of the service in future

To begin, please document all of the above in a markdown document in the repo (e.g. project-plan.md). Then, review the current plan and considerations, and respond to me with your thoughts.

## Claude

Doc's in. Now my take on the plan and the open questions:

**Architecture (DDD, validation → OCR → confidence)** — sound. For a single-endpoint service, I'd keep DDD light: a domain layer with the `OdometerReading` value object and the confidence logic (pure function, easy to unit test), an application layer with one use case that orchestrates the three steps, and infrastructure adapters behind a small `OcrEngine` interface. That interface is the part worth protecting — it's what lets you swap OCR engines later without touching validation or confidence logic.

**OCR package** — I'd start with **Tesseract.js**. It's pure JS/WASM (no native binary to install, no external API/credentials), runs fully offline so it's trivial to test and CI, and it returns per-word confidence scores — which directly answers your confidence unknown. The tradeoffs: it's not tuned for 7-segment/digital odometer displays out of the box, so expect to need image preprocessing (grayscale/contrast via `sharp`, digit-only character whitelist, single-line page segmentation mode) to get reliable results. Cloud OCR (Google Vision, AWS Textract) would likely be more accurate on messy real-world photos, but adds cost, credentials, network latency, and makes offline testing harder — worth keeping as a "later adapter" rather than the v1 choice.

**Confidence** — Tesseract's per-word score (0–100) is a reasonable base signal, but I'd combine it with a couple of cheap sanity checks (digit count in plausible range, no stray non-digit characters, single unambiguous number found) rather than trusting the raw OCR score alone. That combination logic belongs in the domain layer as a pure function so it's testable without ever invoking OCR.

**File size** — this is really a resolution question, not a size question: you need enough resolution to resolve individual digits, so I'd set a generous-but-bounded cap (e.g. 5MB) rather than trying to derive it from the OCR package. Worth stating as a documented, tunable limit rather than solving now.

**Duplicate uploads / caching** — I'd lean toward **not building this for v1**. It's a stateless, synchronous endpoint; caching adds storage, TTL/eviction, and image-retention/privacy questions that aren't justified without evidence of real duplicate traffic. Worth a line in the doc as a deliberate future-expansion item rather than solving speculatively.

One thing I'd add to the unknowns list: **units (miles vs km)**. The response schema has a `unit` field, so it's worth deciding now whether that's always `"miles"` for v1 or whether you want a client-supplied hint — OCR alone can't reliably tell you which unit a display is in.

Want me to fold those decisions back into the doc, or move on to scaffolding the project structure?

## You

Okay, let's update the plan document with the following, replacing unknows where they have been answered:

- Project to use Tesseract.js for first implementation. Confidence score to be based on package's per-word confidence, supplemented with domain-specific checks on numeric value etc.
- Add the file size limit as a tentative upper-bound for now. We may need to consider resolution.
- Remove dupe/caching unknown

Add to unknowns:

- How to single out the correct mileage reading from the uploaded images (ignoring other numbers/text)?
- Units vs miles - majority of cars in UK/US use miles. Could we expand for km odometers? From examples images, this may be difficult as not all meters show the unit (mi/km).

Then, update README.md's Further consideration section, expanding the relevant sections briefly where we have answered them.

## Claude

Now let's update the README's "Further considerations" section.

## Claude

Both docs updated: `project-plan.md` now reflects Tesseract.js as the chosen OCR engine and the resolved/added unknowns, and the README's "Further considerations" section has brief answers filled in for file size, distance units, and confidence calculation, leaving "HTTP vs HTTPS" untouched since it's still unresolved.

## You

<ide_selection>The user selected the lines 52 to 53 from /home/ben-murray/dev/projects/backend-exercise-odometer/project-plan.md:
**How to single out the correct mileage reading from the uploaded
images** (ignoring other numbers/text)?

This may or may not be related to the current task.</ide_selection>
Thoughts on how to single out the correct mileage reading from the uploaded images (ignoring other numbers/text), and HTTP vs HTTPS?

## Claude

**Singling out the right reading:**

Tesseract.js returns each recognized word/line with a bounding box and confidence, so the raw material for this is already there — the problem is picking the right candidate out of a noisy set (trip meter, speed, clock, warning icons, etc.). I'd handle it with cheap heuristics before reaching for anything model-based:

- **Pattern filter**: odometers are typically 5–6 contiguous digits (occasionally with a smaller trailing tenths digit), no decimal point in the main display. That alone rules out clocks (`12:34`), percentages, and most trip meters (`123.4`, often prefixed `TRIP`/`A`/`B`).
- **Keyword exclusion**: if a candidate sits next to text like `trip`, `avg`, `mph`, `km/h`, exclude it.
- **Tie-break on confidence/length**: if more than one candidate survives the filter, prefer the highest-confidence one; if it's genuinely ambiguous, that's a signal for the confidence calculator (drop to `low` / `UNREADABLE_IMAGE`) rather than guessing.

This is a pure, testable function — a good fit sitting right next to (or folded into) the confidence calculator in the domain layer, since candidate selection and confidence are really the same problem. A proper fix (crop to the odometer display region first, via a small object-detection model) would be more robust but is a real ML effort — worth flagging as future work rather than v1 scope.

**HTTP vs HTTPS:** I'd treat this as a deployment concern, not something the Node app handles. Terminate TLS at a reverse proxy/ingress/load balancer in front of the service (standard practice — cert management via that layer, e.g. Let's Encrypt or a managed cert), and have the app itself just listen on plain HTTP behind that boundary. For local dev/this exercise, HTTP-only is fine. Worth noting in the doc that HTTPS should still be enforced at the edge in any real deployment, since uploaded images could carry incidental PII (plates, location).

Want these folded into the plan doc as answered unknowns, or left as-is for now?

## You

Agreed on all heuristics, except for that I don't think we can rely on 5-6 continuous digits for all cases (consider brand new cars - may have 0 digit placeholders but may not). Same for trip prefixes; we can't be confident in this. Update the plan doc with the rest though please.

Re. HTTP/HTTPS - let's disregard this for now and revisit during refinement.

## Claude

Done — the reading-selection unknown is now folded into "Current approach" as soft tie-breaking signals rather than hard rules, and I dropped the fixed digit-count/keyword-dependency framing per your point about placeholder digits on new cars. Left HTTP/HTTPS untouched in the README for now, to revisit during refinement.

## You

<ide_opened_file>The user opened the file /home/ben-murray/dev/projects/backend-exercise-odometer/src/server.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>
Let's continue by expanding the server scaffold to match the requirements. I've added the method+path extraction + routing logic already, along with some validation on the content type. Without making any changes, can you please review server.ts with regards to convention and correctness?

## Claude

Reviewing without making changes. Here's what stands out:

**Correctness**

1. **Missing `return` after the 415 branch is a real bug** (server.ts:14-17). When content type is unsupported, you write the 415 response, but execution falls through into the same block and calls `res.writeHead(200, ...)` / `res.end(...)` again on line 18-19. Node's `http` module throws `ERR_HTTP_HEADERS_SENT` ("Cannot set headers after they are sent") the moment `writeHead` is called a second time — this will crash that request. Needs a `return;` (or restructure with `else`) after the 415 `res.end()`.

2. **Error response shape doesn't match the contract you've already documented** in project-plan.md/README — the spec is `{ "error": "<CODE>", "message": "<description>" }` (a stable code plus a human-readable message), but both the 415 and 404 handlers here collapse everything into a single free-text `error` string (e.g. `` `Unsupported content type: wanted...` ``). Worth aligning now since callers will likely start branching on `error` as a code.

**Convention**

3. **Inconsistent quote style within the file** — `"node:http"` (double) vs `'node:url'`, `'POST'`, `'/odometer/reading'` (single). The original scaffold was consistently double-quoted; worth picking one and sticking to it (also worth adding Prettier/ESLint at some point so this isn't a manual concern).

4. **Indentation changed from 2 spaces to 4** relative to the original scaffold — not wrong, but inconsistent with what was already there. Worth deciding now before more files are added, since there's no formatter configured yet to catch drift.

5. `import { URL } from 'node:url'` is unnecessary — `URL` has been a Node global since v10, so the existing scaffold-style code wouldn't normally import it. Not incorrect, just redundant.

6. Minor naming nit: `pathName` — the `URL` API's own property is `pathname` (no capital N); matching that would be more conventional and mildly reduce friction when reading Node docs/types side by side.

7. Not a bug, but worth a conscious decision: a `GET` to `/odometer/reading` currently falls into the generic "path not recognised" 404, which is misleading since the path _is_ recognised, just not for that method — a `405 Method Not Allowed` would be more accurate if you want to handle that case explicitly.

Nothing else jumps out — the multipart/JSON content-type sniffing logic itself and the `URL`-based parsing are reasonable.

## You

<ide_opened_file>The user opened the file /home/ben-murray/dev/projects/backend-exercise-odometer/src/server.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>
Can you reverse the logic so we can fail early, then handle the invalid method and path scenarios separately

## Claude

Restructured into three independent guard clauses — path check (404), method check (405), content-type check (415) — each returning early, followed by the happy path. Confirmed it compiles cleanly with `npm run build`.

## You

<ide_opened_file>The user opened the file /home/ben-murray/dev/projects/backend-exercise-odometer/src/validation.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>
Nice, next let's handle image validation. I've created a neighbouring `validation.ts` with some constants for size and resolution. Let's add a function that will take the image data from the request and check that is it within the accepted boundaries. Let's use the `sharp` package to inspect the dimensions, and assert our accepted file formats against the metadata.

## Claude

`Metadata` lives in the `sharp` namespace but isn't re-exported as a named type — need `sharp.Metadata` via the default import's namespace, not a bare `sharp.Metadata` type reference without importing the namespace form. Let me fix the type annotation.

## Claude

Need to add the `readMetadata` helper.

## Claude

`npm run build` passes clean. Here's `src/validation.ts`:

## Claude

Order of checks: raw byte size (cheap, no decode needed) → `sharp` decode (catches corrupt/garbage data) → format check against `metadata.format` (the actual decoded type, not a trusted header) → dimension bounds. Returns a discriminated union rather than throwing, so the caller decides how to map it to an HTTP response.

One decision worth flagging: I used `sharp`'s decode failure (corrupt/unparseable bytes) as `UNREADABLE_IMAGE` rather than inventing a separate code, since it isn't covered by your example error but "corrupt file" and "OCR found no digits" both land on the same client action (retake the photo). If you'd rather keep `UNREADABLE_IMAGE` reserved specifically for the post-OCR "no reading found" case and want a distinct code for decode failures, easy to split out — let me know.

## You

<ide_opened_file>The user opened the file /home/ben-murray/dev/projects/backend-exercise-odometer/src/validation.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>
Great, now let's link this up with server.ts as our next stage of validation

## Claude

Now update `validation.ts` to use the shared `ErrorCode` and export `MAX_FILE_SIZE` so the multipart parser can enforce the same limit while streaming.

## Claude

Now the request-body extraction module:

## Claude

Now wire it into `server.ts`:

## Claude

Now let's verify everything compiles and update `package.json`/`tsconfig` if needed for busboy's types.

## Claude

Compiles clean. Let's do a quick end-to-end smoke test against a real sample image and a couple of error paths.

## You

[Request interrupted by user for tool use]

## Claude

No response requested.

## You

<ide_selection>The user selected the lines 6 to 7 from /home/ben-murray/dev/projects/backend-exercise-odometer/src/requestImage.ts:
const IMAGE_FIELD_NAME = "image";
const MAX_JSON_BODY_SIZE = MAX_FILE_SIZE * 2; // account for base64 + JSON overhead

This may or may not be related to the current task.</ide_selection>
Explain the selected lines

## Claude

`IMAGE_FIELD_NAME` and `MAX_JSON_BODY_SIZE` are constants used by the extraction functions further down in `requestImage.ts`:

- **`IMAGE_FIELD_NAME = "image"`** — the field name the API expects the image under in both transports: the multipart form field name (`extractFromMultipart` filters incoming file parts for `fieldName === IMAGE_FIELD_NAME`, discarding any others) and the JSON body key (`extractFromJson` reads `parsed[IMAGE_FIELD_NAME]` for the base64 string). Centralizing it in one constant means both code paths agree on the same contract name.

- **`MAX_JSON_BODY_SIZE = MAX_FILE_SIZE * 2`** — the cap used when buffering the raw JSON request body in `readBody()`, before it's even parsed. `MAX_FILE_SIZE` (imported from `validation.ts`) is the limit on the _decoded_ image, but the JSON payload has to be larger than that: base64 inflates binary data by ~33%, plus there's the surrounding JSON structure (`{"image": "..."}`) and key/quote overhead. Doubling gives comfortable headroom for that inflation without it being a real size increase, so oversized uploads still get rejected while reading the stream, rather than being buffered in full first and rejected only after decoding.

## You

<ide_opened_file>The user opened the file /home/ben-murray/dev/projects/backend-exercise-odometer/src/extract.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>
Breakdown your approach in extract.ts

## Claude

`extract.ts` turns whichever transport the client used (multipart or base64 JSON) into a single `Buffer`, or a typed error, before validation/OCR ever get involved.

**Entry point** ([extract.ts:12-20](src/extract.ts#L12-L20)) — `extractImage` branches purely on the `Content-Type` header (already sniffed for shape by `server.ts` before this is called) and dispatches to one of two extractors. Both return the same `ExtractionResult` union (`{ ok: true; data }` or `{ ok: false; code; message }`), so `server.ts` doesn't need to know which transport was used.

**Multipart path** ([extract.ts:22-92](src/extract.ts#L22-L92)) — streams the request through `busboy` rather than buffering it all first:

- `busboy.on("file", ...)` filters for the field named `"image"`. Any other file part gets `.resume()`'d — busboy requires every file stream to be drained or the parse just hangs, even for parts you don't care about (line 43).
- The matched file's chunks are collected in an array and joined with `Buffer.concat` once its stream closes.
- Size enforcement piggybacks on busboy's own `limits.fileSize` (set to `MAX_FILE_SIZE`, imported from `validation.ts` so the two limits can't drift apart) — if exceeded, the stream's `.truncated` flag is checked at close and mapped to `INVALID_INPUT` instead of silently returning a truncated image.
- No file at all, malformed multipart syntax, and a dropped connection are each handled on their own event (`busboy close` → `MISSING_IMAGE`, `busboy error` → `INVALID_INPUT`, `req error` → `INVALID_INPUT`) so the promise can't hang indefinitely.
- The `settle()` helper (line 35) is a resolve-once guard, since several of those events could otherwise fire in overlapping ways and try to resolve the promise twice.

**JSON path** ([extract.ts:94-136](src/extract.ts#L94-L136)) — buffers the whole body via `readBody` (capped at `MAX_JSON_BODY_SIZE`, i.e. `MAX_FILE_SIZE * 2` to allow for base64's ~33% inflation plus JSON structure overhead), then:

- `JSON.parse`s it, catching syntax errors as `INVALID_INPUT`
- pulls out `parsed.image`, requiring it to be a non-empty string (`MISSING_IMAGE` otherwise)
- strips an optional `data:image/...;base64,` prefix so both raw base64 and data-URI form work
- decodes with `Buffer.from(base64, "base64")` — deliberately _not_ wrapped in try/catch, since that call never throws on malformed input, it just drops invalid characters; genuinely garbage data is instead caught later by `sharp`'s decode step in `validation.ts`, which is the one place that actually knows if the bytes form a real image

**Shared `readBody`** ([extract.ts:142-180](src/extract.ts#L142-L180)) — a generic streaming body reader used only by the JSON path, enforcing the byte cap while streaming rather than after the fact, so an oversized payload gets `req.destroy()`'d mid-stream instead of being fully buffered into memory first.

## You

<ide_selection>The user selected the lines 124 to 125 from /home/ben-murray/dev/projects/backend-exercise-odometer/src/extract.ts:
const base64 = image.replace(/^data:[^;]+;base64,/, "");
const data = Buffer.from(base64, "base64");

This may or may not be related to the current task.</ide_selection>
Explain the selected lines

## Claude

These two lines turn the client-supplied base64 string into raw image bytes.

**Line 124** strips an optional data-URI prefix. Base64 image payloads are sometimes sent as a bare string (`"iVBORw0KG..."`), but browsers commonly produce them via `canvas.toDataURL()` or `FileReader`, which yields the full data URI form (`"data:image/png;base64,iVBORw0KG..."`). The regex `/^data:[^;]+;base64,/` matches that prefix — `data:`, any non-`;` characters (the MIME type), `;base64,` — and removes it if present. If the client sent a bare base64 string with no prefix, the regex simply doesn't match and `.replace` is a no-op, so both forms are accepted transparently.

**Line 125** decodes the resulting base64 text into a `Buffer` of actual image bytes — this is the `Buffer` that flows into `ExtractionResult.data` and eventually into `sharp` for validation.

Worth noting (as covered in the previous breakdown): `Buffer.from(str, "base64")` never throws, even on malformed base64 — Node's decoder just skips invalid characters rather than erroring. So this line can't be the thing that catches "not actually valid base64"; that's left to `sharp`'s decode step downstream, which will fail with `UNREADABLE_IMAGE` if the decoded bytes don't form a real image. That's a deliberate choice made in the previous step rather than an oversight here — no try/catch was added around this call since it would never trigger.

## You

<ide_selection>The user selected the lines 158 to 170 from /home/ben-murray/dev/projects/backend-exercise-odometer/src/extract.ts:
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

This may or may not be related to the current task.</ide_selection>
What event is "data" referring to here?

## Claude

`"data"` is the standard Node.js stream event — `req` (an `IncomingMessage`) is a `Readable` stream, and `"data"` fires each time a chunk of the incoming request body arrives off the socket. It has nothing bespoke to do with our `ExtractionResult`/`{ok, data}` shape elsewhere in the file; it's purely the stream API event name.

A few things worth knowing about it in this context:

- Attaching a `"data"` listener switches the stream into **flowing mode** — chunks start arriving automatically and continuously as the request body streams in, rather than needing manual `.read()` calls.
- Since `req.setEncoding()` was never called, each `chunk` arrives as a raw `Buffer`, not a string — hence the `Buffer` type annotation and `chunk.byteLength` here rather than `chunk.length` on a string.
- It can fire many times for a single request (once per TCP chunk received), which is exactly why `total` is accumulated across calls rather than just checking the final size — the whole point of this handler is to reject an oversized body _while it's still streaming in_, via `req.destroy()`, instead of buffering the entire thing into memory first and checking afterward.
- It's paired with `"end"` (fires once, when the stream has no more data) and `"error"` (fires if the connection breaks mid-stream) elsewhere in `readBody` — together those three events are the complete lifecycle for manually consuming a Node readable stream.

## You

<ide_opened_file>The user opened the file /home/ben-murray/dev/projects/backend-exercise-odometer/src/tests/server.spec.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>
Let's write some tests to verify that the current solution works as expected. I've made a start in the attached file. Please expand to cover success and failure responses. We may need to decouple the server definition and listener so that tests can attach to the app properly. Make a plan first, breaking down test cases and any refactoring that you believe is necessary.

## Claude

I've kicked off exploration to check the current test setup, existing test file draft, and available Node/TS test tooling — will report back once it's done.

## You

<task-notification>
<task-id>a5460b0860a605f4f</task-id>
<tool-use-id>toolu_01CaTCAZadwXPfuhmNZ5gpi7</tool-use-id>
<output-file>/tmp/claude-1000/-home-ben-murray-dev-projects-backend-exercise-odometer/89bc5a72-6646-421e-975b-cc2e621e2ae0/tasks/a5460b0860a605f4f.output</output-file>
<status>completed</status>
<summary>Agent "Explore test setup and current server code" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>## Summary of Findings

### 1. File contents (verbatim)

**`src/server.ts`**

```ts
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

const server = http.createServer(async (req, res) =&gt; {
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

const PORT = 3000;

server.listen(PORT, "localhost", () =&gt; {
  console.log(`Server running at http://localhost:${PORT}/`);
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

  if (contentType == "" || (!isMultipart &amp;&amp; !isJson)) {
    sendErrorResponse(
      res,
      "UNSUPPORTED_FILE_TYPE",
      `Unsupported content type: wanted multipart/form-data or application/json, got ${contentType}`,
    );
    return false;
  }

  return true;
}
```

**Important bug/gotcha for your test plan:** `server` is a local `const`, **not exported**. `src/server.ts` also calls `server.listen(3000, "localhost", ...)` unconditionally at module load time (no `if (import.meta.url === ...)` guard), so simply importing this module — as the existing spec tries to do — starts a real listening server on port 3000 as a side effect. You'll need either to export `server` and remove/guard the auto-listen, or refactor into an app-factory function, before it's testable in the conventional supertest/`node:test` style.

**`src/extract.ts` — does not exist.** The actual file is `src/services/extract.ts` (imported in server.ts as `./services/extract.js`):

```ts
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
): Promise&lt;ExtractionResult&gt; {
  if (contentType.startsWith("multipart/form-data")) {
    return extractFromMultipart(req, contentType);
  }
  return extractFromJson(req);
}

function extractFromMultipart(
  req: IncomingMessage,
  contentType: string,
): Promise&lt;ExtractionResult&gt; {
  return new Promise((resolve) =&gt; {
    const busboy = Busboy({
      headers: { "content-type": contentType },
      limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    });

    let settled = false;
    let imageFound = false;

    const settle = (result: ExtractionResult) =&gt; {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    busboy.on("file", (fieldName, file) =&gt; {
      if (fieldName !== IMAGE_FIELD_NAME || imageFound) {
        file.resume(); // must drain every file stream, even ones we discard
        return;
      }
      imageFound = true;

      const chunks: Buffer[] = [];
      file.on("data", (chunk: Buffer) =&gt; chunks.push(chunk));

      file.on("close", () =&gt; {
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

    busboy.on("error", (err) =&gt; {
      settle({
        ok: false,
        code: "INVALID_INPUT",
        message: `Malformed multipart body: ${(err as Error).message}`,
      });
    });

    busboy.on("close", () =&gt; {
      if (!imageFound) {
        settle({
          ok: false,
          code: "MISSING_IMAGE",
          message: `No file found in "${IMAGE_FIELD_NAME}" field`,
        });
      }
    });

    req.on("error", () =&gt; {
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
): Promise&lt;ExtractionResult&gt; {
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
    typeof parsed === "object" &amp;&amp; parsed !== null
      ? (parsed as Record&lt;string, unknown&gt;)[IMAGE_FIELD_NAME]
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
): Promise&lt;BodyReadResult&gt; {
  return new Promise((resolve) =&gt; {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const settle = (result: BodyReadResult) =&gt; {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    // "data" event fires each time a chunk arrives off the socket.
    // Supports continous stream flow instead of manual .read() calls.
    req.on("data", (chunk: Buffer) =&gt; {
      total += chunk.byteLength;
      if (total &gt; maxBytes) {
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

    req.on("end", () =&gt; settle({ ok: true, data: Buffer.concat(chunks) }));
    req.on("error", () =&gt;
      settle({
        ok: false,
        code: "INVALID_INPUT",
        message: "Error reading request body",
      }),
    );
  });
}
```

**`src/validation.ts` — does not exist.** The actual file is `src/services/validate-content.ts` (imported as `./services/validate-content.js`):

```ts
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

export async function validateImage(data: Buffer): Promise&lt;ValidationResult&gt; {
  if (data.byteLength &gt; MAX_FILE_SIZE) {
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

  if (width &gt; MAX_WIDTH || height &gt; MAX_HEIGHT) {
    return {
      valid: false,
      code: "INVALID_INPUT",
      message: `Image dimensions ${width}x${height} exceed maximum of ${MAX_WIDTH}x${MAX_HEIGHT}`,
    };
  }

  return { valid: true };
}
```

**`src/utils/errors.ts`**

```ts
export type ErrorCode =
  | "MISSING_IMAGE"
  | "UNSUPPORTED_FILE_TYPE"
  | "UNREADABLE_IMAGE"
  | "INVALID_INPUT";

export const STATUS_BY_CODE: Record&lt;ErrorCode, number&gt; = {
  MISSING_IMAGE: 400,
  UNSUPPORTED_FILE_TYPE: 415,
  UNREADABLE_IMAGE: 422,
  INVALID_INPUT: 400,
};
```

**`src/tests/server.spec.ts`** (exact current content — note it references `describe`/`it`/`expect` which are not all imported, and imports `supertest`, which is not installed):

```ts
import request from "supertest";
import { server } from "../server.js";
import { describe } from "node:test";

describe("POST /odometer/reading", () =&gt; {
  it("returns a user", async () =&gt; {
    const res = await request(server).post("/odometer/reading");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ response: "Hello Odometer enthusiast!" });
  });
});
```

Note: only `describe` is imported from `node:test`; `it` and `expect` are undefined in this file as written. This spec would fail to even parse/run as-is, quite apart from `server` not being exported.

**`package.json`**

```json
{
  "name": "backend-exercise-odometer",
  "version": "1.0.0",
  "description": "Extracts mileage data from odometer images",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" &amp;&amp; exit 1",
    "build": "tsc",
    "start": "node dist/server.js",
    "format": "prettier . --write"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/just-insure/backend-exercise-odometer.git"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "bugs": {
    "url": "https://github.com/just-insure/backend-exercise-odometer/issues"
  },
  "homepage": "https://github.com/just-insure/backend-exercise-odometer#readme",
  "devDependencies": {
    "@types/busboy": "^1.5.4",
    "@types/node": "^26.2.0",
    "prettier": "3.9.6",
    "typescript": "^7.0.2"
  },
  "type": "module",
  "dependencies": {
    "busboy": "^1.6.0",
    "sharp": "^0.35.3"
  }
}
```

**`tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src"]
}
```

### 2. Test-specific config

None found. No `vitest.config.ts`, `jest.config.js`, `.mocharc*`, `tap.config*`, or separate test `tsconfig` anywhere in repo root or `src/` (confirmed via recursive search excluding `node_modules`).

### 3. Test framework / HTTP-testing libraries installed

**None are installed.** Checked `node_modules` directly and `package.json` deps/devDeps:

- No `vitest`, `jest`, `mocha`, `tap`, `chai`, `sinon`, `supertest`, or `undici` anywhere in `node_modules` (all lookups returned empty).
- `package-lock.json` has zero matches for any of vitest/jest/mocha/tap/supertest/undici/chai/sinon.
- `package.json` devDependencies contain only: `@types/busboy@^1.5.4`, `@types/node@^26.2.0`, `prettier@3.9.6`, `typescript@^7.0.2`. No test runner or assertion/HTTP-testing library declared.
- The existing `src/tests/server.spec.ts` imports `supertest` and calls `describe`/`it`/`expect` — none of these are available; this spec would fail immediately with a module-not-found error for `supertest` (and `it`/`expect` are not even imported from `node:test`/`node:assert`).

Installed versions confirmed directly from `node_modules/*/package.json`:

- `@types/node`: **26.2.0**
- `typescript`: **7.0.2**

### 4. File trees

`src/`:

```
src/server.ts
src/services/extract.ts
src/services/validate-content.ts
src/tests/server.spec.ts
src/utils/errors.ts
```

`images/`:

```
images/33c24909-e9dd-46d3-8e7f-c44fd9896537.jpeg
images/3ae9d173-8895-409e-844c-77b5841138d7.jpeg
images/d621e37e-7c0f-49a4-8a19-d628b1e82a33.jpeg
images/dbab9932-823e-49ed-80db-1e898d836d5e.jpeg
```

(No corresponding "expected reading" fixture/metadata files alongside the images — just four raw `.jpeg` files, no README or JSON manifest describing expected odometer values in `images/`.)

Root of repo also contains: `.gitignore` (ignores `node_modules/` and `dist/`), `package.json`, `package-lock.json`, `project-plan.md`, `README.md`, `tsconfig.json`.

### 5. `test` script in package.json (verbatim)

```
"test": "echo \"Error: no test specified\" &amp;&amp; exit 1"
```

This is the default npm-init placeholder — it always fails and doesn't invoke any real test runner.

### 6. Node engine / version implications

- `package.json` has **no `engines` field**, so there's no declared minimum Node version constraint.
- `@types/node` is pinned to `^26.2.0` and `typescript` to `^7.0.2` — these are unusually high/future-looking version numbers (current real-world Node LTS is v22.x, and TypeScript is at 5.x as of this writing), so these appear to be either placeholder/aspirational version pins or a forward-dated environment; take that into account since your local toolchain will actually resolve to whatever these ranges installed.
- Actual installed toolchain in `node_modules` matches those pins exactly: `@types/node@26.2.0`, `typescript@7.0.2`.
- The **running Node binary** in this environment is **v22.23.2** (`node --version`), with npm **10.9.8**.
- Given Node v22.23.2: `node:test` (built-in test runner) and `node:assert` are fully available with zero extra dependencies — no test framework install needed if you go that route. Native `fetch` is also built in (stable since Node 18).
- Native TypeScript execution: Node 22.23.2 predates the type-stripping feature being unflagged as default (that landed as `--experimental-strip-types` becoming default-on around Node 22.6+ for `.ts` in some builds, but full stripping-by-default without any flag is a v23+/v24+ story, and erasable-syntax-only support varies by exact 22.x patch). Given `tsconfig.json` uses `strict` mode and `NodeNext` module resolution, and the code has type-only imports (`import type { ... }`) which are erasable-syntax compatible, running `node --experimental-strip-types src/tests/server.spec.ts` (or similar) is plausible to test locally, but you should verify Node 22.23.2's exact `--experimental-strip-types` support/behavior before relying on it rather than compiling via `tsc` first — I did not find any repo config (e.g., npm script or doc) currently exercising this, so it's unproven in this codebase.

**Practical implication for your test plan:** since no test framework/HTTP-testing lib is installed, and the existing spec references `supertest` (uninstalled) and `expect`/`it` (unimported), you'll need to decide between (a) adding `devDependencies` for a real runner/HTTP client (e.g., `supertest` + `node:test`, or `vitest`), or (b) writing the plan around Node's built-in `node:test` + `node:assert` + raw `http`/`fetch` requests against a listening server, which needs zero new dependencies given Node 22.23.2 is already running. Either way, `src/server.ts` needs `server` exported (and its top-level `.listen()` call guarded or moved into a start function) before any of this is testable without side effects.</result>
<usage><subagent_tokens>20098</subagent_tokens><tool_uses>12</tool_uses><duration_ms>77391</duration_ms></usage>
</task-notification>

## Claude

The exploration surfaced some real problems with the current state: the file layout has moved (`src/services/extract.ts`, `src/services/validate-content.ts`), no test framework is installed at all, and the draft `server.spec.ts` won't even parse (imports uninstalled `supertest`, uses unimported `it`/`expect`, and imports a `server` export that doesn't exist). I've sent a design validation off to a planning agent — will report back once it's done.

## You

Okay just give me what you have so far.

## Claude

Here's the current state of my findings and proposed design, before the validation agent reports back.

**Problems with what's there now:**

1. `server.ts` doesn't export `server`, and calls `.listen(3000, ...)` unconditionally at module load — importing it for tests would start a real listener as a side effect.
2. The draft `src/tests/server.spec.ts` won't run as-is: it imports `supertest` (not installed), uses `it`/`expect` without importing them, and imports a `server` named export that doesn't exist.
3. No test framework or HTTP-testing library is installed at all — `package.json`'s `test` script is still the npm-init placeholder.
4. File layout has moved since I last touched it: `src/extract.ts` → `src/services/extract.ts`, `src/validation.ts` → `src/services/validate-content.ts`, `src/errors.ts` → `src/utils/errors.ts`.

**Proposed approach:**

- **Refactor `server.ts`**: export a `createServer()` factory that builds the `http.Server` without calling `.listen()`; guard the existing `.listen(3000, ...)` bootstrap behind an ESM "run as main" check so it only fires when the file's run directly, not when tests import it. Tests then call `createServer().listen(0)` for an OS-assigned ephemeral port and `.close()` it in teardown.
- **Zero new dependencies**: Node 22 (confirmed running here) has `node:test` + `node:assert/strict` built in for the runner/assertions, plus global `fetch`/`FormData`/`Blob`/`Request` for HTTP calls and multipart body construction — no need for `supertest` or a manual multipart encoder. I still need to confirm these are usable at the TypeScript type-checking level given the current `tsconfig.json` has no `dom` lib.
- **Three layered test files** under `src/tests/`:
  - `validate-content.spec.ts` — pure unit tests for `validateImage` (valid JPEG/PNG, oversized bytes, corrupt data, unsupported format via a synthesized WEBP, oversized dimensions) — all using `sharp` to synthesize tiny fixture images on the fly rather than needing real large files.
  - `extract.spec.ts` — unit tests for `extractImage`, feeding it fake request streams directly (both JSON and multipart paths), covering missing/empty image field, malformed JSON, oversized body, wrong multipart field name, multiple file parts, oversized file.
  - `server.spec.ts` (rewritten) — integration tests hitting the real running server via `fetch`: wrong path/method, unsupported content-type, and happy-path + one representative failure end-to-end for each transport.
- **`package.json`**: replace the placeholder `test` script with something like `tsc && node --test dist/tests`.

Still waiting on the planning agent to sanity-check the refactor pattern and confirm the `fetch`/`FormData`/`Readable.fromWeb` approach works cleanly under this exact Node/TypeScript setup before I finalize the plan file.

## You

<local-command-caveat>Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to.</local-command-caveat>

## You

<command-name>/model</command-name>
<command-message>model</command-message>
<command-args>opus</command-args>

## You

<local-command-stdout>Set model to claude-opus-5</local-command-stdout>

## You

<task-notification>
<task-id>a26d0aaf629a8f6be</task-id>
<tool-use-id>toolu_018N9RnxWHZk6RZNUuqS4WP6</tool-use-id>
<output-file>/tmp/claude-1000/-home-ben-murray-dev-projects-backend-exercise-odometer/89bc5a72-6646-421e-975b-cc2e621e2ae0/tasks/a26d0aaf629a8f6be.output</output-file>
<status>completed</status>
<summary>Agent "Design test suite and server refactor plan" finished</summary>
<note>A task-notification fires each time this agent stops with no live background children of its own. The user can send it another message and resume it, so the same task-id may notify more than once.</note>
<result>## Findings

I verified the plan against the actual installed toolchain (Node v22.23.2, TypeScript 7.0.2, @types/node 26.2.0) rather than assumptions, and read the real source files (they match your summary exactly, byte-for-byte on logic). Below are answers to your five questions, in order, then the concrete plan.

### 1. `server.ts` refactor — cleaner pattern confirmed available

Your factory + guarded `.listen()` approach is right, and there's a cleaner mechanism than the traditional `import.meta.url === pathToFileURL(process.argv[1]).href` dance: **`import.meta.main` is available and typed in this exact environment.**

Verified empirically:

```
node --input-type=module -e "
console.log('entry main:', import.meta.main);        // true
const mod = await import('data:text/javascript,export const m = import.meta.main;');
console.log('imported module main:', mod.m);          // false
"
```

And it's typed — `@types/node/web-globals/importmeta.d.ts` declares `interface ImportMeta { dirname; filename; main: boolean; url; resolve(); }`, referenced globally via `index.d.ts`. So:

```ts
export function createServer(): http.Server {
  return http.createServer(async (req, res) =&gt; { ... });
}

if (import.meta.main) {
  const server = createServer();
  server.listen(PORT, "localhost", () =&gt; {
    console.log(`Server running at http://localhost:${PORT}/`);
  });
}
```

This is simpler and more robust than comparing `argv[1]`, since it doesn't need `pathToFileURL`/`fileURLToPath` and correctly returns `false` for dynamically-imported or re-exported modules too. No caveats found for Node 22.23.2. Recommend this over the manual URL-comparison idiom.

One adjustment to your factory shape: keep `PORT` and the top-level `console.log` inside the `if (import.meta.main)` block (as above), not module-level — otherwise importing the module for tests still evaluates `const PORT = 3000` fine (harmless) but there's no reason to leave `.listen` bootstrap code split awkwardly. `createServer()` returning a bare `http.Server` (not calling `.listen`) matches what you proposed — no changes needed there.

### 2. `fetch`/`FormData`/`Blob`/`Request`/`Readable.fromWeb` — confirmed usable at runtime and type-checked, no `lib: dom` needed

Runtime: all confirmed present as globals in Node 22.23.2 (`typeof fetch === "function"`, same for `FormData`, `Blob`, `Request`, `Response`).

Types: `@types/node@26.2.0` ships its own ambient declarations for these under `node_modules/@types/node/web-globals/*.d.ts` (`fetch.d.ts`, `blob.d.ts`, `streams.d.ts`, etc.), backed by `undici-types@~8.3.0`, and these are pulled in automatically via `/// &lt;reference path="web-globals/fetch.d.ts" /&gt;` etc. in `index.d.ts` — which is loaded whenever `types: ["node"]` is present in `tsconfig.json` (already the case here). **No `lib: "dom"` addition needed**, and adding it would actually be counterproductive (it'd pull in the full DOM lib including conflicting/incompatible globals). I confirmed this compiles cleanly against your exact `tsconfig.json` (`target: ES2022`, `types: ["node"]`, no `lib` override).

Also empirically confirmed the exact header your test bodies will produce is compatible with the handler's content-type check:

```
content-type: multipart/form-data; boundary=----formdata-undici-055389285556
```

`handleContentValidation`'s check is `contentType.startsWith("multipart/form-data;")` — matches regardless of what follows the semicolon, so this works.

`Readable.fromWeb` — confirmed present (`static fromWeb(readableStream: web.ReadableStream, options?): Readable`). One small gotcha: its parameter type is `web.ReadableStream` (Node's own `stream/web` type), and `Request.body` is typed `ReadableStream&lt;Uint8Array&gt; | null` — nullable. In practice it will never be `null` for a `POST` with a non-empty `FormData`/string body, but under `strict: true` you'll need a null guard or non-null assertion, e.g.:

```ts
if (!request.body) throw new Error("expected a body");
const fakeReq = Readable.fromWeb(request.body) as unknown as IncomingMessage;
```

Note the cast to `IncomingMessage` — a plain `Readable` doesn't structurally satisfy `IncomingMessage` (missing `headers`, `method`, etc.), but per your own correct observation, `extractFromMultipart` only calls `req.pipe(busboy)` and `req.on("error", ...)`, both of which exist on plain `Readable`. Since `extractImage`'s signature requires `IncomingMessage`, you'll need an explicit cast (`as unknown as IncomingMessage`) at the unit-test call site — this is expected and fine for test code, just flagging it so it's not a surprise mid-implementation.

### 3. `node:test` API — confirmed, needs explicit import (not global)

`node_modules/@types/node/test.d.ts` confirms `declare module "node:test"` exports `test`, with `namespace test { export { suite as describe, test as it }; }`, plus standalone `function before/after/beforeEach/afterEach` in the `test` namespace, all importable as named exports from `"node:test"`. Nothing is injected as a true global (unlike Jest) — every spec file needs:

```ts
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
```

`node:assert/strict` is separately typed (`node_modules/@types/node/assert/strict.d.ts`) and default-exports the strict assert function — confirmed. Full async/await support in `it`/`test` callbacks (returns a `Promise&lt;void&gt;`, awaited by the runner) — standard, no gotchas.

Running against compiled ESM output: no special flags needed. `package.json` has `"type": "module"` at the root, which governs `dist/**/*.js` too (no nested `package.json` in `dist`), so Node's module loader treats compiled test files as ESM automatically, and `node:test` has native ESM support since early Node 18 — confirmed no `--experimental-vm-modules`-style flag is required (that's a Jest-with-ESM concern, not applicable to `node:test`).

### 4. Critical risk found: your proposed `"test": "tsc &amp;&amp; node --test dist/tests"` script will silently discover zero tests

I traced this from Node's actual v22.23.2 source (`lib/internal/test_runner/runner.js`, `createTestFileList`) rather than guessing:

- Node's **default** test-file discovery pattern (used only when no CLI arguments are given) is: `**/{test,test/**/*,test-*,*[._-]test}.{js,mjs,cjs}` — i.e., it matches a file/dir literally named `test`, anything under a `test/**` directory segment, `test-*.js`, or `*.test.js`/`*-test.js`/`*_test.js`. **It does not match a `tests` (plural) directory**, and it does not match `*.spec.js` filenames.
- Your compiled output lands at `dist/tests/*.spec.js` (rootDir `src` → `src/tests/*.spec.ts`). Directory segment is `tests`, not `test`; filenames end in `.spec.js`, not `.test.js`. **Neither would match the default pattern if you ever ran bare `node --test` with no path.**
- More importantly for your proposed script: when you _do_ pass an explicit argument (`node --test dist/tests`), `createTestFileList` sets `hasUserSuppliedPattern = true` and passes your literal string straight into Node's internal `Glob` matcher — bypassing the default-pattern substitution entirely. Whether a bare, non-magic directory path like `dist/tests` (no `*`/`**` in it) gets silently expanded to "all `.js` files inside" by that `Glob` implementation is **not clearly documented**, and I was not able to confirm it via docs or source excerpts alone (and I'm not able to empirically verify by creating a scratch directory, since this task is read-only). Relying on undocumented behavior here is a real risk of the script quietly running 0 tests (Node's test runner exits 0 with no output when nothing matches a directory-only arg in some versions/configs — that's the dangerous failure mode, not a loud error).

**Recommended fix (belt and suspenders, cheap to do):**

1. Change the npm script to pass an **explicit glob pattern**, quoted so the shell doesn't expand it: `"test": "tsc &amp;&amp; node --test \"dist/tests/**/*.spec.js\""`. Per the confirmed `createTestFileList` logic, a user-supplied pattern (magic or not) goes straight to `Glob`, and `**/*.spec.js` is unambiguous glob(7) syntax that will match regardless of the "test" vs "tests" directory-naming nuance.
2. As defense-in-depth (and closer to `node:test`'s own idiom), consider naming files `*.test.ts` instead of `*.spec.ts` — then even a bare `node --test dist/tests` or `node --test` with no args would independently match via the documented default pattern `**/*.test.{js,...}`. Either naming works fine with the explicit-glob script from (1); I'd lean toward `*.test.ts` since it removes the dependency on the explicit-glob workaround being your only safety net, at zero cost.

I'd implement both: rename to `*.test.ts` **and** keep the explicit glob in the script. Belt and suspenders, no downside.

### 5. Test case list — validated, two small additions

- **Sharp performance**: confirmed fast, not a flakiness concern. Empirically: encoding three tiny synthetic images (PNG, WEBP, oversized-dimension JPEG) took ~33ms total cold-start; decoding metadata from a 50×50 PNG took ~1ms. No mocking needed, real `sharp` calls in a tight loop are fine.
- **Fixtures**: confirmed all 4 `images/*.jpeg` are 1920×1080 JPEGs (300–760 KB) — safely under both the 5 MB and 4000×4000 limits, valid for "happy path" cases.
- **Gap in your multipart drain test**: `extractFromMultipart`'s guard is `if (fieldName !== IMAGE_FIELD_NAME || imageFound)` — an OR of two conditions. Your proposed case ("wrong field name" + "one named `image`, one not") only exercises the `fieldName !== IMAGE_FIELD_NAME` half. Add one more case: **two file fields both literally named `"image"`** — confirms the `imageFound` half of the OR (the second occurrence gets drained via `.resume()` even though its name matches) is also covered. Cheap to add, closes a real branch-coverage gap.
- **`MAX_JSON_BODY_SIZE` is not exported** from `extract.ts` (only `MAX_FILE_SIZE` is exported from `validate-content.ts`; `MAX_JSON_BODY_SIZE = MAX_FILE_SIZE * 2` is a private const in `extract.ts`). Your "oversized JSON body" test can't import it directly. Two options:
  - (a) Duplicate the derived value in the test with a comment (`MAX_FILE_SIZE * 2 + 1`, noting it mirrors extract.ts's private constant) — zero production changes, but silently drifts if the internal multiplier ever changes.
  - (b) Export `MAX_JSON_BODY_SIZE` from `extract.ts` — a one-line, low-risk change to production code that removes the drift risk.
    I'd lean toward (b) since it's trivial and removes a latent test-fragility source, but either is defensible; flagging so it's a conscious choice rather than an oversight.
- Everything else in your three-file breakdown (`validate-content.spec`, `extract.spec`, `server.spec`) is sound, appropriately layered, and not redundant — the integration file correctly avoids re-testing validation/extraction edge cases already covered at the unit level, only checking end-to-end wiring plus the HTTP-layer-only concerns (404/405/missing content-type) that the unit tests can't reach.

### On `--experimental-strip-types` as a zero-build alternative (your open question)

Confirmed empirically that Node 22.23.2 has type-stripping **on by default** for `.ts` files (the `--help` text lists `--no-experimental-strip-types`, i.e., the negative form, confirming default-on) — you don't even need the flag. However, I'd still recommend **against** using it as the primary test-running mechanism here, for two reasons specific to this project:

1. Type-stripping is syntax erasure only, not type-checking — it would let genuinely type-incorrect test code run silently, which defeats a meaningful chunk of the value of writing tests in TS in the first place (e.g., wouldn't catch you calling `validateImage(someString)` instead of `Buffer`).
2. It would create a second, inconsistent code path from the project's existing `npm run build`/`npm start`, which are both `tsc`-based. Keeping tests on the same `tsc`-then-run pipeline means `npm test` and `npm run build` fail on the exact same class of errors, which is a good property for a small exercise repo.

Stick with `tsc &amp;&amp; node --test "dist/tests/**/*.test.js"` as the primary. Worth noting as a nice-to-have aside (not part of the plan) that `--experimental-strip-types` could be used later for a fast `test:watch`-style dev loop if desired, but that's out of scope here.

---

## Implementation Plan (ordered, mechanical)

**Step 1 — Refactor `src/server.ts`** (modify existing file)

- Wrap the `http.createServer(...)` construction in an exported `export function createServer(): http.Server { ... }` that builds and returns the server with the request listener attached, exactly as currently written internally.
- Move `const PORT = 3000;` and the `.listen(...)` call (plus its `console.log`) into a guarded block: `if (import.meta.main) { const server = createServer(); server.listen(PORT, "localhost", () =&gt; console.log(...)); }`.
- Leave `handleMethodAndPathValidation`, `handleContentValidation`, `sendResponse`, `sendErrorResponse`, `ODOMETER_READING_PATH` as private (unexported) module-level helpers — no need to export them, tests exercise them indirectly through `createServer()` + real HTTP requests.
- No other logic changes.

**Step 2 — Update `package.json`**

- Replace the placeholder `"test"` script with:
  `"test": "tsc &amp;&amp; node --test \"dist/tests/**/*.test.js\""`
- No new dependencies to add (zero-dependency approach confirmed viable).
- Optionally add a `"pretest"`-independent note: since `build` already runs `tsc`, `test` duplicates that compile step deliberately (so `npm test` alone is self-sufficient in CI) — this is fine, `tsc` is fast enough for a project this size and idempotent.

**Step 3 — Delete/replace `src/tests/server.spec.ts`** with the naming scheme decided in point 5 above (rename family to `*.test.ts`, not `*.spec.ts`, given the discovery-pattern findings). Concretely, remove the broken stub and create three new files:

- `src/tests/validate-content.test.ts`
- `src/tests/extract.test.ts`
- `src/tests/server.test.ts`

(If you'd rather keep the `.spec.ts` convention for readability/team preference, that's fine too — just make sure the npm script's explicit glob is updated to `**/*.spec.js` to match, per point 4's finding. The glob approach makes either naming convention safe; I'm recommending `.test.ts` only as a low-cost extra safety margin, not a hard requirement.)

**Step 4 — `src/tests/validate-content.test.ts`** (pure unit, no server/network)

- Import: `validateImage`, `MAX_FILE_SIZE` from `../services/validate-content.js`; `sharp` default import; `node:fs/promises` (`readFile`) + `node:path` to load a fixture; `describe`/`it` from `node:test`; `assert` from `node:assert/strict`.
- Resolve fixture path via `import.meta.dirname` (also confirmed typed/available on `ImportMeta`) walking up to the repo-root `images/` directory, e.g. `path.join(import.meta.dirname, "../../images/&lt;one-file&gt;.jpeg")` — pick one fixture file by its known filename (list is static, only 4 files).
- Cases exactly as you proposed: valid JPEG fixture → `{ valid: true }`; valid synthesized PNG via `sharp({ create: {...} }).png().toBuffer()` → `{ valid: true }`; oversized buffer `Buffer.alloc(MAX_FILE_SIZE + 1)` → `INVALID_INPUT`, asserting this returns fast (implicitly fast since it short-circuits before decode — no special timing assertion needed, just don't add an artificial delay); corrupt bytes `Buffer.from("not an image")` → `UNREADABLE_IMAGE`; synthesized WEBP via `sharp(...).webp().toBuffer()` → `UNSUPPORTED_FILE_TYPE`; synthesized 4001×100 JPEG via `sharp({ create: {...} }).jpeg().toBuffer()` → `INVALID_INPUT`.
- Assert both `valid`/`code` and that `message` is a non-empty string (don't over-assert exact wording — keep tests resilient to message copy changes; check `code` strictly, `message` loosely e.g. `assert.equal(typeof message, "string")` or a substring match at most).

**Step 5 — `src/tests/extract.test.ts`** (unit, fake `req` streams, no real HTTP server)

- Import: `extractImage` from `../services/extract.js`; `node:stream` (`Readable`); fixture loader as above; `describe`/`it`, `assert`.
- JSON-path cases (construct fake `req` as a `Readable` fed via `Readable.from([Buffer.from(JSON.stringify(...))])` or a `PassThrough` you `.end()` immediately — simpler than the FormData/Request route since JSON needs no multipart encoding): valid base64 `image` field; `data:image/jpeg;base64,...`-prefixed field; missing `image` field → `MISSING_IMAGE`; empty-string `image` field → `MISSING_IMAGE`; malformed JSON text → `INVALID_INPUT`; oversized JSON body exceeding the JSON size cap (per Step-4-adjacent decision on exporting or duplicating `MAX_JSON_BODY_SIZE` — use whichever you choose) → `INVALID_INPUT`. Call `extractImage(fakeReq, "application/json")` directly (contentType param drives the JSON branch since it doesn't start with `"multipart/form-data"`).
- Multipart-path cases, using the `FormData`/`Blob`/`Request`/`Readable.fromWeb` technique validated in point 2 above: valid file under `"image"` field name using a real fixture buffer → `ok: true` with matching bytes (assert `Buffer.compare(extraction.data, fixtureBuffer) === 0` or `.equals(...)`); wrong field name (`form.append("notimage", ...)`) → `MISSING_IMAGE`; empty `FormData` (no parts at all) → `MISSING_IMAGE`; two file fields, one `"notimage"` one `"image"` → confirm correct extraction and that the drain doesn't hang/error; **add the extra case from point 5 above**: two file fields both named `"image"` → confirm only the first is used, no error, no hang; oversized file exceeding busboy's `fileSize` limit (append a `Blob` bigger than `MAX_FILE_SIZE`, e.g. `Buffer.alloc(MAX_FILE_SIZE + 1024)`) → `INVALID_INPUT`. For all multipart cases: build with `new Request("http://localhost/x", { method: "POST", body: form })`, read `request.headers.get("content-type")!` for the real boundary, guard `request.body` non-null, `Readable.fromWeb(request.body)` cast `as unknown as IncomingMessage`, pass to `extractImage(fakeReq, contentType)`.

**Step 6 — `src/tests/server.test.ts`** (integration, real server, real HTTP)

- Import: `createServer` from `../server.js`; `describe`, `before`, `after`, `it`; `assert`; fixture loader.
- `before()`: `server = createServer(); server.listen(0); await once(server, "listening")` (or wrap in a `Promise` if you prefer not to pull in `node:events`' `once`) — then read the assigned port via `(server.address() as AddressInfo).port` and build `baseUrl = http://localhost:${port}/odometer/reading`.
- `after()`: `await new Promise(resolve =&gt; server.close(resolve))` (or `server.close()` + `once(server, "close")`).
- Cases exactly as you proposed: `GET` instead of `POST` → 405; wrong path (e.g. `/nope`) → 404; `Content-Type: text/plain` → 415/`UNSUPPORTED_FILE_TYPE`; no `Content-Type` header at all (send via raw `fetch` with an empty-string body and no headers, or use `node:http` directly if `fetch` insists on setting a content-type for non-empty bodies — verify at implementation time whether `fetch` auto-sets `Content-Type` for a plain string/Buffer body, since if it does, you may need a raw `http.request` call for this one specific case to truly omit the header) → 415; happy path via multipart with a real fixture → 200 and body strictly equal to `"Hello Odometer enthusiast!\n"` (current placeholder, asserted verbatim per your own correct note — do not invent a future JSON-reading shape); happy path via JSON base64 with a real fixture (`JSON.stringify({ image: fixtureBuffer.toString("base64") })`, `Content-Type: application/json`) → 200, same placeholder body; one representative validation-layer failure end-to-end (POST corrupt bytes as multipart or JSON image) → 422 `UNREADABLE_IMAGE`.
- One implementation note to flag now rather than discover mid-coding: verify whether global `fetch` auto-injects a `Content-Type` header when given a plain string body — if so, the "missing Content-Type entirely" test case needs a raw `http.request`/`http.get`-style call instead of `fetch`, since you can't ask `fetch` not to set one for a non-empty body. This is a small implementation detail, not a design blocker.

**Step 7 — Sanity pass**

- Run `npm test` once fully implemented; confirm all three files are picked up by the glob, confirm no port collisions (ephemeral port via `.listen(0)` avoids this even under `node --test`'s default parallel-file execution).
- Optionally run `npx tsc --noEmit` first during development to catch type errors fast without invoking the test runner each time (confirmed clean today against the existing production files — only the old broken stub errors, which Step 3 removes).

### Critical Files for Implementation

- /home/ben-murray/dev/projects/backend-exercise-odometer/src/server.ts
- /home/ben-murray/dev/projects/backend-exercise-odometer/package.json
- /home/ben-murray/dev/projects/backend-exercise-odometer/src/tests/server.spec.ts (to be deleted/replaced)
- /home/ben-murray/dev/projects/backend-exercise-odometer/src/services/extract.ts
- /home/ben-murray/dev/projects/backend-exercise-odometer/src/services/validate-content.ts</result>
<usage><subagent_tokens>60569</subagent_tokens><tool_uses>35</tool_uses><duration_ms>405430</duration_ms></usage>
</task-notification>

## You

[Request interrupted by user for tool use]

## You

Proceed with the implementation with the following caveats:

- For separating server creation and listener, let's instead split it out into two files: app.ts to create and configure the app and export it, and server.ts to import the app and call listen().
- Keep this first pass limited to renaming the spec.ts file and adding tests for server response scenarios. Do not add further tests files yet.

## Claude

Proceeding. Starting with the `app.ts` / `server.ts` split.

## Claude

Now the test file rename and the response-scenario tests.

## Claude

All 13 pass. Quick check that the split didn't break the actual server bootstrap:

## Claude

Server boots and serves 200 on the real port. Confirmed cleanly split.

**What changed:**

- **[src/app.ts](src/app.ts)** (new) — holds the whole request handler and its helpers, exporting the configured `app` as an `http.Server`. No `.listen()` call, so importing it has no side effects.
- **[src/server.ts](src/server.ts)** — now just the bootstrap: imports `app`, calls `app.listen(3000)`.
- **[src/tests/server.test.ts](src/tests/server.test.ts)** — renamed from `server.spec.ts` (via `git mv`, so history is preserved) and rewritten. Binds the app to port `0` in `before` for an OS-assigned ephemeral port, closes in `after`.
- **[package.json](package.json)** — `test` script is now `tsc && node --test "dist/tests/**/*.test.js"`.

**Two decisions I made, since the clarifying question got interrupted** — say the word if you'd rather go the other way on either:

1. **Test stack: Node's built-in `node:test` + `node:assert/strict`, zero new dependencies.** Global `fetch` and `FormData`/`Blob` handle the HTTP calls and multipart encoding, so no `supertest` or `form-data` needed. I verified all of these exist in your Node v22.23.2 and are typed by `@types/node` without needing `lib: dom`.
2. **Renamed to `*.test.ts`** rather than keeping `.spec.ts` — it matches `node:test`'s default discovery pattern, so tests are found even with a bare `node --test`. The npm script also passes an explicit glob, belt-and-braces.

**13 tests, all passing**, covering the response scenarios only as you asked: routing (404 unknown path, 405 wrong method), content-type validation (415 unsupported, 415 absent), multipart (200 valid, 400 `MISSING_IMAGE` on wrong field name, 422 `UNREADABLE_IMAGE` on junk bytes), and base64 JSON (200 valid, 200 data-URI prefixed, 400 missing field, 400 empty field, 400 malformed JSON, 422 undecodable).

One thing worth flagging for when you're ready for the next pass: because `app` is a module-level singleton, all test files that bind it share one instance. That's fine now with a single file, but if you later add `extract.test.ts`/`validate-content.test.ts` as pure unit tests they won't touch it — and if you ever want a _second_ file that binds a server, we'd want a `createApp()` factory instead. Not a problem today, just the thing that would force the change.

## You

<ide_selection>The user selected the lines 22 to 24 from /home/ben-murray/dev/projects/backend-exercise-odometer/src/tests/app.test.ts:
await once(app, "listening");

const { port } = app.address() as AddressInfo;

This may or may not be related to the current task.</ide_selection>
Explain these lines please

## Claude

These three lines are the handshake between "start listening" and "know where to send requests" — they exist because binding a port in Node is asynchronous.

**Line 21 (context for the rest):** `app.listen(0, "localhost")` asks the OS to bind a port. Passing `0` is the special "give me any free port" request — the OS picks an unused one. That avoids hardcoding `3000` in tests, which would collide with a dev server you already have running, and would also make two test files unable to run in parallel.

**Line 22:** `await once(app, "listening")` pauses until the server has actually finished binding. `.listen()` returns immediately — it _initiates_ the bind and fires a `"listening"` event when the OS has completed it. `once()` (from `node:events`) is the promise-based way to wait for a single event: it resolves the first time `"listening"` fires. Without this await, the next line would run while the socket is still unbound.

**Line 24:** `app.address()` returns the address the server actually bound to — which is the only way to discover _which_ port the OS handed out, since we asked for `0` rather than choosing one. Destructuring `{ port }` off it gives the real number, used to build `baseUrl` on line 25. This is precisely why line 22 is required: had we not waited for `"listening"`, `address()` would still return `null` here and the destructure would throw.

The `as AddressInfo` cast is a TypeScript concern rather than a runtime one. `address()` is typed as `string | AddressInfo | null` because a server bound to a Unix domain socket returns a plain string path instead of an object. We know this one is TCP (we passed a port and host), so the cast narrows it to the object form to let `.port` be accessed. It's the standard idiom for this, though it is an assertion — if the server weren't listening, the cast would hide that from the type checker and fail at runtime instead.

The `after` hook on lines 29-31 mirrors the same pattern in reverse: `close()` starts the teardown, and `once(app, "close")` waits for it to complete, so the test process doesn't exit with a socket still open.

## You

<ide_selection>The user selected the lines 48 to 48 from /home/ben-murray/dev/projects/backend-exercise-odometer/src/tests/app.test.ts:
satisfies RequestInit;

This may or may not be related to the current task.</ide_selection>
Explain this other type cast

## Claude

Worth separating from the `as AddressInfo` case, because `satisfies` is genuinely _not_ a cast — it's closer to the opposite.

`as` is an assertion: it overrides the type checker, telling it "trust me, treat this as `AddressInfo`". It can lie, and if it does, you find out at runtime.

`satisfies` is a check: it asks the type checker to _verify_ the value conforms to `RequestInit`, and errors at compile time if it doesn't. Nothing is overridden and nothing is silenced.

The reason for it here is a subtlety in how TypeScript infers object literals. Without the operator, `jsonBody` would return an inferred type of roughly:

```ts
{ method: string; headers: { "Content-Type": string }; body: string }
```

`method` widens to `string`, but `fetch` expects `RequestInit`, whose `method` is compatible with `string` — so that particular case would actually pass. The real value is catching mistakes inside the object: a typo'd key (`method` → `methd`), or a value of the wrong shape, would otherwise sail through as a perfectly valid anonymous object and only fail when `fetch` received it. `satisfies` makes the function's return value validated against the type `fetch` actually wants, at the point of definition.

The other half of why it's `satisfies` rather than a type annotation: annotating the return type as `RequestInit` would _widen_ the value to `RequestInit`, discarding the specific literal types. `satisfies` validates against the type while preserving the narrower inferred type — you get the check without losing information. That's the whole reason the operator exists (it's a TS 4.9 addition).

In this file it's mostly a low-stakes correctness guard on a small helper. It's more valuable in things like config objects, where you want the keys checked against a known interface but still want autocomplete on the _specific_ keys you wrote.

## You

<ide_opened_file>The user opened the file /home/ben-murray/dev/projects/backend-exercise-odometer/src/tests/app.test.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>
Please proceed with adding unit tests for file data extraction and validation

## Claude

Now the two unit test files. Let me check one behavioral detail first — busboy is configured with `files: 1`, which affects how multi-part uploads behave:

## Claude

Type friction between undici's `ReadableStream` and Node's `stream/web` version. Simpler to buffer the encoded body and reuse the existing `fakeRequest` helper — avoids the cast entirely:

## Claude

Now the call sites need `await`:

## Claude

53 tests but I only wrote 40 — a stale `dist/tests/server.test.js` is lingering from before the rename. `tsc` doesn't clean its output dir:

## Claude

40 tests, all passing. Let me verify one thing I want to report accurately — whether the "second file" test actually exercises the drain branch, given busboy is capped at `files: 1`:

## Claude

Confirmed: with `files: 1`, busboy emits `filesLimit` rather than a second `file` event. Let me fix the stale-output footgun that masked my test count:

## Claude

Two new unit test files added, **40 tests passing** across all three files.

**[src/tests/validate-content.test.ts](src/tests/validate-content.test.ts)** — 12 tests, pure unit, no network. Uses `sharp` to synthesize tiny fixtures rather than needing real files on disk (a WEBP and GIF for the format rejection, a 4001px image for the dimension check). Covers: accepted JPEG/PNG/at-max-dimensions; file size over and exactly at the limit; undecodable data (junk bytes, empty buffer, truncated JPEG); rejected formats; over-wide and over-tall images.

**[src/tests/extract.test.ts](src/tests/extract.test.ts)** — 15 tests. Fake requests are just `Readable.from([buffer])` cast to `IncomingMessage`, which works because `extractImage` only pipes the stream and listens for `"error"`. Multipart bodies are built with the standard-library `FormData`/`Request` encoder and then buffered via `request.arrayBuffer()`, so the boundary and part headers match what a browser actually sends without hand-rolling the wire format. Covers the JSON path (valid base64, data-URI prefix, missing/empty/non-string field, non-object body, base64 decoding to nothing, malformed JSON, oversized body) and the multipart path (valid file, no parts, wrong field name, second file, oversized file, malformed body).

**Two things worth your attention:**

1. **`dist/` isn't cleaned between builds, and it silently inflated the test count.** After you renamed `server.test.ts` → `app.test.ts`, the stale `dist/tests/server.test.js` stayed behind and kept running — 53 tests reported where only 40 exist. That's the dangerous direction for a test script to fail in, since deleted tests keep "passing". I added `rm -rf dist &&` to the `test` script. Note that makes the script Linux/macOS-only; if Windows matters, swap it for something like `rimraf`.

2. **The `imageFound` half of the guard in [extract.ts:42](src/services/extract.ts#L42) is unreachable.** I probed busboy directly to confirm: with `limits: { files: 1 }`, it emits `filesLimit` instead of a second `file` event, so `imageFound` is never `true` when that guard runs. The `fieldName !== IMAGE_FIELD_NAME` half is doing all the work.

   The more interesting consequence is a real edge case: because busboy only ever emits the _first_ file part, a client who sends some other file field **before** the image gets `MISSING_IMAGE` — the image is never seen at all. My "different field name" test passes for that reason rather than the intended one. Whether that matters depends on whether you expect clients to send extra file fields; raising `files` above 1 would make the drain logic function as written. Happy to change it either way, but it's a behavioral decision rather than a clear-cut bug, so I left it alone.

## You

<ide_opened_file>The user opened the file /home/ben-murray/dev/projects/backend-exercise-odometer/src/services/extract.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>
For this first pass we should limit to a single image per request, rejecting requests with any other data in the body. What would you advise based on this?

## Claude

Good constraint to pin down now — it makes the contract explicit and simplifies the confidence work later. Here's what I'd advise:

**1. Raise `limits.files` from 1 to 2.** This is counter-intuitive but necessary: with `files: 1`, busboy _silently discards_ everything after the first file, so you can't reject what you can't see. Setting it to 2 means the second file event fires, you reject, and busboy still caps the parse cheaply. This also fixes the attribution bug I found — `["odometer", "image"]` currently reports `MISSING_IMAGE` when the real problem is the unexpected field.

**2. Reject eagerly on first sight of anything unexpected**, rather than collecting and validating at the end:

- any file part whose field name isn't `image` → reject (don't drain-and-continue)
- a second file part named `image` → reject
- any non-file field (busboy's `field` event, currently unhandled — text fields sail through today) → reject

**3. Mirror it on the JSON side.** Right now `{"image": "...", "unit": "km"}` silently ignores `unit`. If multipart is strict, JSON should be too: reject any key other than `image`.

**4. Use `INVALID_INPUT` rather than a new error code.** It already covers "other invalid inputs" in your spec, so the documented error contract stays as-is. Message can name the offending field.

**5. Stop parsing once rejected.** Currently `settle()` resolves the promise but busboy keeps consuming the stream — so a rejected 5MB upload is still read in full. Worth `req.unpipe()` + `req.destroy()` on the failure path, since strictness is only a real win if it lets you bail early.

The one judgement call worth your input: **strictness is a one-way door for clients.** Rejecting unknown fields means a client that later adds `{"image": ..., "requestId": ...}` breaks. That's the right default for a v1 with a single known consumer, and it matches how you'd want an insurance-facing API to behave — but if you expect third parties to integrate before the contract settles, ignoring unknown _non-file_ fields while still rejecting extra _files_ is the softer middle ground.

I'd go strict on both, given this is v1 with no external consumers yet. Want me to implement it that way, with tests covering each rejection case?

## You

<ide_opened_file>The user opened the file /home/ben-murray/dev/projects/backend-exercise-odometer/package.json in the IDE. This may or may not be related to the current task.</ide_opened_file>
Sounds good, please implement as outlined, remebering to update tests where appropriate and add new ones to assert that the "image" field constraints work as expected. Re. strictness - this is fine for now.

## Claude

Now let me rewrite the multipart extractor with strict rejection and early bail-out:

## Claude

You're right, and my recommendation was wrong. `filesLimit` fires when busboy hits the cap, so extras are detectable _without_ raising it — and keeping `files: 1` means busboy stops parsing the extra file's content rather than reading it just to reject it. Your instinct about the limit existing for a reason holds.

The only thing lost is message precision on the second file (busboy never parses its field name, so it can't be named). Worth it. Implementing your way:

## Claude

Good catch — and it's worse than unnecessary. `req.destroy()` on an `IncomingMessage` tears down the underlying socket, which can kill the response before our JSON error reaches the client; they'd see a connection reset instead of a 400. Delivering the error reliably matters more than skipping the remaining bytes, so I'll drop it and keep `settle` as it was.

## Claude

Now the JSON side — reject unknown keys:

## Claude

Now update the existing tests that assert the old lenient behaviour, and add cases for the new constraints:

## Claude

`assert.equal` narrows inside the helper but that doesn't propagate to the call site. Making `assertFailed` an assertion function fixes it and helps any future test that inspects the message:

## Claude

Now update the multipart tests for the new strict behaviour:

## Claude

Now the app-level test that asserted the old `MISSING_IMAGE` behaviour for a wrong field name:

## Claude

All 45 pass. Let me review the final state of the extractor:

## Claude

Implemented, **45 tests passing**. `files: 1` stayed exactly as it was — your read was correct.

**[src/services/extract.ts](src/services/extract.ts)**, multipart path:

- Any file part whose field name isn't `image` is rejected by name ([extract.ts:48](src/services/extract.ts#L48)), rather than drained and ignored. This also fixes the misattribution I flagged — `["odometer", "image"]` now says _"Unexpected file field odometer"_ instead of the misleading `MISSING_IMAGE`.
- `filesLimit` ([extract.ts:76](src/services/extract.ts#L76)) catches extra files. As you suspected, this is all that was needed — busboy fires it at the cap, so the extras are detectable without raising the limit, and it stops parsing their content rather than reading them just to reject them.
- A `field` handler ([extract.ts:69](src/services/extract.ts#L69)) rejects non-file fields, which previously passed through entirely unnoticed.
- One structural change worth knowing about: success is no longer resolved when the file stream closes. It's held in `imageData` and resolved at busboy's `close` ([extract.ts:88](src/services/extract.ts#L88)), because otherwise a valid image followed by a trailing junk part would resolve successfully before the junk was ever seen.

JSON path rejects any key other than `image`, naming the offenders in the message.

`req.destroy()` is not there, per your question — it would have torn down the socket and risked replacing our 400 with a connection reset.

**Tests:** two existing assertions changed to match the new contract (wrong field name is now `INVALID_INPUT` not `MISSING_IMAGE`; the "ignores a second file" test now asserts rejection). Six new cases: second file under `image`, second file under another name, text field alongside the image, text field alone, JSON with an extra key, plus an app-level test that a genuinely empty upload still gives `MISSING_IMAGE`. The text-field cases deliberately append after the file, so they exercise the deferred-resolution path above.

Two small things I noticed but left alone:

1. **An empty file under the `image` field** yields `UNREADABLE_IMAGE` (422) from the validator, whereas the JSON path returns `MISSING_IMAGE` (400) for an empty string. Defensible either way, but the two transports disagree on the same user error.
2. **`MISSING_IMAGE` vs `INVALID_INPUT` both map to 400**, so clients only see the distinction in the `error` code, not the status. Fine as-is, just noting it since the strictness work added more `INVALID_INPUT` paths.

## You

<ide_opened_file>The user opened the file /home/ben-murray/dev/projects/backend-exercise-odometer/src/services/extract.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>
Make one last small adjustment to ensure that empty file under the image field are always reported as MISSING_IMAGE

## Claude

Done — 47 tests passing.

An empty file under the `image` field now returns `MISSING_IMAGE` (400) from both transports, matching the JSON path's existing behaviour. The check is in the busboy `close` handler ([extract.ts:88-99](src/services/extract.ts#L88-L99)): a zero-length buffer falls through to the failure branch, with the message distinguishing "field was empty" from "no file found" so the two causes stay diagnosable.

Two new tests cover it: a unit test in [extract.test.ts](src/tests/extract.test.ts) and an end-to-end one in [app.test.ts](src/tests/app.test.ts) confirming the 400 surfaces correctly through the HTTP layer.

## You

<ide_opened_file>The user opened the file /home/ben-murray/dev/projects/backend-exercise-odometer/src/app.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>
Cool. For the final part of the implementation we need to implement tesseract in the way we have set out in project-plan.md. I have created tesseract.ts already and populated it with a bare-bones, incomplete solution which we can call from app.ts when it is ready. Please create a plan for the remainder of the implementation which covers the following:

- Populates tesseract.ts with logic that extracts the mileage figure from the image data and supplies the value along with a confidence score
- Extends app.ts to call tesseract.ts to determine final client response
- Creates dedicated unit tests for tesseract and extends app.test.ts to cover full file upload flow with valid file.

## Claude

I've reviewed the four sample images, and there's a significant finding that affects the testing approach. Let me confirm two decisions while I finish investigating the Tesseract API.

## Claude

Let me verify one thing that could change the whole preprocessing approach — whether those "rotated" images are actually EXIF-oriented:

## Claude

All four images carry EXIF `orientation=6` — so `sharp().rotate()` auto-orients every one of them. That removes the rotation problem in a single line. Writing the plan now.

## Claude

First step from the plan: read the rotated fixture after auto-orientation, and verify the `PSM` named import survives the CJS/ESM boundary.

## Claude

`PSM` imports cleanly as a value (`SPARSE_TEXT` = 11). Now the rotated fixture:

## Claude

`ODO 161967` — with a clock `8:31` competing above it. Let me confirm the fourth expected value too:

## Claude

All four expected values confirmed:

| Fixture    | Reading                   | Competing numbers |
| ---------- | ------------------------- | ----------------- |
| `33c24909` | **62690** (`62690.5 mi`)  | `111 MILES TO E`  |
| `3ae9d173` | **161967** (`ODO 161967`) | clock `8:31`      |
| `d621e37e` | **154510**                | `104 miles` range |
| `dbab9932` | **205265** (`ODO 205265`) | speedo/RPM dials  |

Now implementing.

## Claude

Now the pure interpretation module:

## Claude

Right — and `app.ts` already imports `extractOdometer` from there. Let me add it to `tesseract.ts` as the orchestrating helper, matching the shape of `validateImage`/`extractImage`:

## Claude

Compiles clean. Before writing tests, let me see what OCR actually produces on the four fixtures:

## Claude

0 for 4. OCR is finding the speedo dial numbers but missing the actual displays — the digit regions are small and low-contrast. Let me run a preprocessing experiment before settling on an approach:

## Claude

`x2/BLOCK` got 1/4; CLAHE errored after sharpen. The displays are a tiny fraction of the frame. Let me test whether Tesseract can read them at all when zoomed in — via tiling:

## Claude

Even 25 tiles per image: zero hits. Let me isolate whether this is a _localisation_ failure or an _engine_ failure, with hand-cropped displays:

## Claude

Big finding: with a tight crop, `33c24909` reads **perfectly** (`62690.5 mi`) under every PSM. So the engine can read these displays — the failure is _localisation_. Let me check my crop coordinates for the other two:

## Claude

Definitive: a pixel-perfect, high-res crop of `161967` reads as `55528`. Tesseract's `eng` model can't decode 7-segment digits — a known limitation (the segment gaps break glyph matching). Let me try one standard mitigation before reporting: morphological closing to bridge the segment gaps.

## Claude

No improvement — that confirms it. Let me write the deterministic unit tests for the scoring logic, and update the app tests whose placeholder-response assertions the new endpoint breaks.

## Claude

All 12 pass. Now updating the app tests whose placeholder assertions the new response breaks:

## Claude

The suite is hanging — the OCR worker thread keeps the process alive after tests finish. Need to terminate it in teardown:

## Claude

All 59 pass in 2.2s. Now the accuracy measurement the plan calls for, using the final implementation:

## Claude

Implementation is complete and wired up, but the accuracy assessment the plan called for came back **0/4**, and I want your call before going further.

**What's built and passing (59 tests):**

- [src/services/tesseract.ts](src/services/tesseract.ts) — OCR adapter with a reused worker singleton, EXIF auto-orientation, greyscale/normalise preprocessing, `{ blocks: true }` for word-level confidence, plus `extractOdometer()` orchestrating OCR → interpretation in the same result-shape as `validateImage`/`extractImage`.
- [src/services/reading.ts](src/services/reading.ts) — the pure scoring module. 12 unit tests, all passing, covering odometer-vs-trip, odometer-vs-speedo, range-vs-odometer, split-digit merging, decimal handling, and every confidence tier.
- [src/app.ts](src/app.ts) — returns the documented `{ reading, unit, confidence }`, `422 UNREADABLE_IMAGE` when nothing is found, `500 INTERNAL_ERROR` on engine failure.

**The problem — Tesseract cannot read these displays:**

| Fixture    | Expected | Got        | Confidence |
| ---------- | -------- | ---------- | ---------- |
| `33c24909` | 62690    | 690        | low        |
| `3ae9d173` | 161967   | 30         | low        |
| `d621e37e` | 154510   | 2          | low        |
| `dbab9932` | 205265   | **100120** | **high**   |

I diagnosed this rather than assuming. Two distinct causes:

1. **Localisation.** The displays occupy a tiny fraction of a 1080×1920 frame. I tried 21 preprocessing/PSM combinations and a 25-tile sweep per image — best was 1/4.
2. **7-segment fonts, which is the harder one.** I hand-cropped each display to a clean, high-res image. `33c24909` (dot-matrix font) then read **perfectly** — `62690.5 mi` under every PSM. But `dbab9932`'s crop, where a human reads `ODO 205265` effortlessly, returned `UNLEADED FUEL ONLY` — Tesseract read the prose beside the digits and not the digits. `3ae9d173`'s crop returned `55528` for `161967`. Morphological closing to bridge the segment gaps made it worse. This is a known `eng`-model limitation: it's trained on printed prose, not segmented LCD glyphs.

**One real defect this exposed:** `dbab9932` returns `100120` with **high** confidence — my merge step joined the speedo's `100` and `120` into a plausible-looking 6-digit number. Confidently wrong is the worst outcome for an insurance workflow. The fix is to require merged words to be spatially adjacent, which needs the word bounding boxes — I have them from Tesseract but dropped them from `OcrWord`. I'd do that regardless of what you decide below.

**Your options:**

1. **Bundle a 7-segment traineddata model** (`letsgodigital`/`ssd`). Directly targets cause 2; `tesseract.js` loads custom models via `langPath`. Costs a committed binary and it won't fix the dot-matrix/localisation cases.
2. **Add display-region detection** before OCR, then read the crop. Targets cause 1, and the crop experiment proves it works where the font is readable. Real CV work.
3. **Swap the engine for cloud OCR.** The `OcrEngine` seam in your plan doc exists precisely for this; cloud engines handle 7-segment far better. Contradicts the offline-first choice.
4. **Ship as-is and document the limitation honestly** — the pipeline, error handling, and confidence model are sound and the swap seam is in place; accuracy is a known gap with a clear next step.

I've deliberately **not** written `tesseract.test.ts` yet, since asserting the true readings today would mean committing four permanently-failing tests. Tell me which direction you want and I'll finish that file to match.

## You

<ide_opened_file>The user opened the file /home/ben-murray/dev/projects/backend-exercise-odometer/src/services/tesseract.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>
I've tweaked the preprocessing to add a threshod and do some resizing, which may prove to be the right approach given that fixture 33c24909 returns 2690, which just lacks the first digit. What would you advise for preprocessing in this way, given that the number we want is usually central to the image?

## Claude

Good instinct on the crop, but the `resize({ width: 900 })` is working against you — it _downscales_ from 1080, shrinking digits that are already too small. Tesseract wants roughly 30–40px cap height. Let me measure rather than guess:

## Claude

All 24 combos: 0/4. But my earlier hand-crop _did_ work — because it was a **wide, short band**, not a square. A square centre-crop at 35% is narrower than the display itself and slices the digits off. Dashboard readouts are wide and short, so the crop should be too:

## Claude

Best is 1/4 — but notably a _different_ image than the full-frame pass hit earlier. That suggests pooling two passes. Let me verify:

## Claude

Measured advice, all from your fixtures:

**1. Drop `.threshold(150)` — it's actively hurting.** Across 24 preprocessing combinations, every configuration with a threshold scored 0/4; hits only appeared without one. A global threshold destroys backlit LCD glyphs, whose strokes sit in the mid-tones — it flattens the segment strokes into the background. This is also the likely cause of your missing leading digit.

**2. Don't downscale.** `resize({ width: 900 })` shrinks a 1080-wide image, and the digits are already too small. Tesseract wants ~30–40px cap height; upscale to 1800–2400 instead.

**3. Crop a wide band, not a square.** This is the key one for "the number is usually central". A square centre-crop at 35% is _narrower than the display itself_ — on `33c24909` the readout spans 620px but a 35% crop is only 378px wide, so it slices the digits off, which is exactly the truncation you saw. Dashboard readouts are wide and short, so take **full width × central ~50% of height**.

**4. `PSM.SINGLE_BLOCK` beats `SPARSE_TEXT`** once you're working on a cropped band.

**5. Run two passes and pool the candidates — this took accuracy from 0/4 to 2/4.** The two passes are complementary: the full frame catches `dbab9932` (205265), the band catches `33c24909` (62690). Neither alone gets both. That also fits the model you described — gather all numeric data, then cross-check — since `reading.ts` already scores a pooled candidate list, so the merge costs nothing architecturally.

```ts
const fullFrame = sharp(data).rotate().grayscale().normalise()
  .resize({ width: 2160 });

// Readouts sit centrally and are wide and short, so a full-width band
// keeps the whole figure while cutting the surrounding dashboard away.
const centralBand = /* extract full width × central 50% height */
  .resize({ width: 1800 });
```

**Two caveats before you commit to this.** The cost is roughly double the OCR latency (~1–4s → 2–8s per request), which matters for the scaling note in `project-plan.md`. And **2/4 is the ceiling for preprocessing alone** — the remaining failures are `3ae9d173` (7-segment, which misreads as `55528` even from a pixel-perfect hand crop) and `d621e37e` (too blurry). Those need a 7-segment model or a different engine, not better preprocessing.

Want me to implement the two-pass version and re-run the measurement?

## You

Yes let's go with the two-pass version for now

## Claude

Now the pooling introduces a subtle issue: the same number read by both passes would tie with itself, collapsing the margin and falsely reporting `low`. Deduplicating by value fixes it:

## Claude

OCR found `205265` in the raw text earlier but scoring picked `18012`. Let me inspect the candidates:

## Claude

`205265` came out as `cu5255` at confidence 0 — marginal. My new preprocessing does a PNG round-trip before resizing, unlike the probe. Let me check whether that's what lost it:

## Claude

Confirmed — the intermediate PNG round-trip destroys the reading; a single fused sharp pipeline preserves it. Let me restructure so each pass is one uninterrupted pipeline:

## Claude

Regressed to 0/4 — normalising _after_ the crop changes the histogram. The 2/4 probe used a fused full-frame but a normalise-then-crop band. Let me replicate that exactly:

## Claude

OCR now sees 2/4 but scoring picks `200120` for `dbab9932` — my merge step is joining two _far-apart_ speedo dial numbers. This is the defect I flagged; it needs bounding boxes to enforce adjacency:

## Claude

Now the test helper needs to supply bboxes:

## Claude

Logic is in place. Now updating the test helper to supply bboxes:

## Claude

Adding a test that pins this specific defect:

## Claude

Still `200120`. Let me check whether that's actually a merge or a single OCR word:

## Claude

`205265` **is** read correctly — at confidence 8. And `200`/`120` (the km/h inner scale) sit only 23px apart with a ~21px character width, so my 1.2 ratio merged them. Tightening it:

## Claude

2/4, and `dbab9932` honestly reports `low` (it was read at confidence 8). Now the OCR test file:

## Claude

All green: 65 tests, 63 passing, 2 skipped as documented limitations, 19s. Let me finish the housekeeping from the plan:

## Claude

Final end-to-end check against a running server:

## Claude

That's the pre-fix result — likely a stale server still holding port 3000. Let me verify:

## Claude

Confirmed — a stale server from the earlier check was answering. Re-running cleanly:

## Claude

The OCR implementation is complete and verified end-to-end. Both transports return the documented shape with correct readings, and the error path still works.

**Accuracy went 0/4 → 2/4.** Three changes got it there, each measured rather than assumed:

1. **Removed your `.threshold(150)`.** Across 24 preprocessing combinations, every configuration with a threshold scored 0/4 — it flattens the mid-tone strokes of a backlit LCD into the background.
2. **Two pooled passes** — full frame at 2160px plus a full-width central band at 1800px. They're genuinely complementary: the full frame catches `dbab9932`, the band catches `33c24909`, neither alone gets both. A subtlety worth knowing: each pass must be _one uninterrupted sharp pipeline_. My first attempt materialised an intermediate PNG and that alone lost `205265`.
3. **Bounding-box adjacency on the merge step.** This fixed the confidently-wrong result I flagged earlier: `200` and `120` from the km/h scale sit 23px apart with a ~21px character width, so my original 1.2 ratio glued them into `200120` and reported it as **high** confidence. At 0.8 they no longer merge, and the real reading wins.

That last one matters beyond the score. `dbab9932` now returns `205265` with **low** confidence — honest, because Tesseract recognised those digits at confidence 8. The system no longer asserts certainty it doesn't have, which for an insurance workflow is the failure mode that actually costs money.

**Files:** [tesseract.ts](src/services/tesseract.ts) (adapter, worker singleton, two-pass preprocessing, `extractOdometer`), [reading.ts](src/services/reading.ts) (pure scoring), [app.ts](src/app.ts) (wiring), plus `INTERNAL_ERROR: 500` in [errors.ts](src/utils/errors.ts).

**Tests: 65 total — 63 passing, 0 failing, 2 skipped.** 13 pure unit tests for the scoring logic (including one pinning the far-apart-digits defect), 5 real-OCR tests, and the existing 47.

The 2 skips are the deliberate part, and I'd flag them for your review since they're a judgement call. `3ae9d173` (seven-segment) and `d621e37e` (out of focus) are written as real assertions with `skip` reasons naming the cause, rather than deleted or weakened — so they turn green automatically if the engine improves. I chose that over four red tests, but if you'd rather see them failing as a standing prompt to fix, that's a one-line change.

Worth being clear that **2/4 is the ceiling for this engine**. `3ae9d173` misreads `161967` as `55528` from a pixel-perfect hand crop, so no preprocessing will recover it — that needs a segment-trained model or a cloud engine, which the `OcrEngine` seam in your plan doc was designed to accommodate. I've documented both limitations and the ~2–7s per-request cost in the README.

## You

<ide_selection>The user selected the lines 67 to 103 from /home/ben-murray/dev/projects/backend-exercise-odometer/src/services/tesseract.ts:
async function preprocess(data: Buffer): Promise<Buffer[]> {
// Downscale and normalise to account for zoom and rotation.
const fullFrame = await sharp(data)
.rotate()
.grayscale()
.normalise()
.resize({ width: FULL_FRAME_WIDTH })
.png()
.toBuffer();

// The band is cropped from an already-normalised image on purpose: levelling
// the contrast across the whole dashboard reads better than levelling it
// within the crop, where the histogram is dominated by the display itself.
const normalised = await sharp(data)
.rotate()
.grayscale()
.normalise()
.png()
.toBuffer();
const { width = 0, height = 0 } = await sharp(normalised).metadata();

// Readouts sit centrally and are wide and short, so the crop keeps the full
// width - a square crop is narrower than the display and truncates digits.
const bandHeight = Math.floor(height * BAND_HEIGHT_RATIO);
const band = await sharp(normalised)
.extract({
left: 0,
top: Math.floor((height - bandHeight) / 2),
width,
height: bandHeight,
})
.resize({ width: BAND_WIDTH })
.png()
.toBuffer();

return [fullFrame, band];
}

This may or may not be related to the current task.</ide_selection>
Is this overkill for the two that are passing? If so, let's dial back to the original approach so that we don't have code that serves no purpose in the current implementation

## Claude

Two things to check here — the pass structure, and some now-orphaned code. You've removed the merge logic from `reading.ts`, which means `bbox` is no longer read by anything. Let me measure whether each pass actually earns its place:

## Claude

Not overkill — the evidence is unambiguous:

| Configuration        | Accuracy | Which fixtures         |
| -------------------- | -------- | ---------------------- |
| **Two-pass**         | **2/4**  | `33c24909`, `dbab9932` |
| Full frame only      | 1/4      | `dbab9932`             |
| Band only            | 1/4      | `33c24909`             |
| Original (no resize) | 0/4      | —                      |

Each pass carries exactly one fixture the other misses, so dropping either halves accuracy and reverting to the original single-pass loses both. I'd keep it.

**But you're right that there is now dead code — just elsewhere.** Removing the merge logic from `reading.ts` orphaned `bbox`: it's populated in `tesseract.ts` and built in the test helper, but nothing reads it any more. Removing it:

## Claude

Now the test helper, which built bboxes and a spacing distinction that no longer means anything:

## Claude

**Two-pass preprocessing: keep it.** Each pass earns its place — full frame carries `dbab9932`, band carries `33c24909`, and neither fixture passes without its own pass. Dialling back to the original single-pass would take you from 2/4 to 0/4.

**The dead code was elsewhere, and is now gone.** Removing your merge logic orphaned `bbox` — `tesseract.ts` was populating it on every word and the test helper was computing synthetic coordinates, but nothing consumed it any more. Removed the field, its population, and the test-side coordinate machinery (`CHAR_WIDTH`, `buildOcr`, `spacedOcrOf`). `grep` confirms no references remain.

I also **deleted the "does not join figures that sit far apart" test**. Worth flagging explicitly rather than burying: with merging gone that test had become vacuous — it passed because nothing joins words at all, not because a guard works. A test that can't fail is worse than no test, since it reads like coverage. The speedometer case it overlapped with is still covered by "prefers the odometer over speedometer and rev counter markings".

Dropping the merge was a good call on your part, incidentally — it's what removed the `200120` false positive at its root rather than by tuning a threshold. The cost is that a display splitting its digits across a gap (`15451 0`) can't be recovered, but that only affected `d621e37e`, which fails on blur regardless.

**63 tests: 61 passing, 0 failing, 2 skipped**, accuracy unchanged at 2/4.

## You

<ide_selection>The user selected the lines 98 to 109 from /home/ben-murray/dev/projects/backend-exercise-odometer/src/tests/reading.test.ts:
it("drops the tenths from a decimal reading", () => {
const result = interpretReading(
ocrOf([
["62690.5", 91],
["mi", 80],
]),
);

      assert.equal(result.found, true);
      assert.equal(result.reading, 62690);
    });

});

This may or may not be related to the current task.</ide_selection>
We actually don't want to do this... for example fixture 33c24 should return 62690.5 as this is the reading from the image.

## Claude

Good catch — `62690.5` _is_ the reading; truncating loses real precision. Let me preserve the decimal while keeping digit-count plausibility based on the integer part:

## Claude

Now the tests that asserted truncation:

## Claude

Done — `62690.5` is now returned intact, and whole readings like `205265` are unaffected.

**What changed in [reading.ts](src/services/reading.ts):** the candidate no longer stores a truncated digit string. It now carries the parsed `value` (`62690.5`), a `key` for duplicate detection, and `integerDigits` separately.

That split matters more than it might look. Digit-count plausibility has to keep counting **whole miles only** — if it counted characters, `62690.5` would score as six digits and a genuine four-digit reading like `9876.5` would be flattered into looking like a five-digit one. Scoring and the confidence tiers both read `integerDigits`, while the returned reading uses `value`.

I also handled the separator: OCR reports the decimal point as `.` or `,` depending on the font (your earlier fixture output included `230,53`), so commas are normalised before parsing. Previously `Number("62690,5")` would have been `NaN`; there's now a `NaN` guard on the candidate filter too.

**Tests: 65 total, 63 passing, 2 skipped.** The truncation test became "keeps the tenths shown by a display", plus two new cases — comma-as-decimal, and one pinning that plausibility is judged on whole miles rather than character count. `tesseract.test.ts` now expects `62690.5` for that fixture, and `app.test.ts` no longer asserts `Number.isInteger` since a fractional reading is now legitimate.

Two things worth your attention:

1. **This deviates from the response spec in your README**, which shows `"reading": 48253` — an integer. Returning `62690.5` is the honest reading, but it's a contract change worth making explicit in the docs, since a consumer might reasonably have assumed an integer.
2. **You have "Capturing decimals in reading" under Future improvements** in the README — that's now done, so it can come out. I left your text alone rather than editing it.
