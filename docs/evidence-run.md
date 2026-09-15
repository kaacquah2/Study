# Evidence Run Report: Firestore Rules & Local-Tier Latency

This document records the exact commands executed, raw runtime outputs, measurements, blocking errors, and configuration changes for the two unevidenced items in the audit report.

---

## Hardware Specification

All measurements and executions were conducted directly on the host development environment:

- **CPU**: Intel(R) Core(TM) i5-8365U CPU @ 1.60GHz
- **Cores**: 4 Physical Cores, 8 Logical Processors
- **System Memory (RAM)**: 16.0 GB DDR4
- **GPU Acceleration**: None (`torch.cuda.is_available() == False`; purely CPU inference)
- **PyTorch Thread Configuration**: Capped at 4 threads via [ml_backend/models/model_registry.py:L16-L18](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/model_registry.py#L16-L18)

---

## Task 1: Firestore Security Rules against the Emulator

### Configuration & Discovery

1. **Firebase Tools Availability**:
   - Executed `npx firebase --version` -> Returned `15.29.0`.
   - To ensure local deterministic execution without interactive prompt freezes, installed locally:
     `npm install -D firebase-tools`
     Added to [package.json:L38](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package.json#L38) (`"firebase-tools": "^15.30.0"`).
2. **Emulator Configuration in `firebase.json`**:
   - [firebase.json:L6-L12](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/firebase.json#L6-L12) already contains an `emulators` block with Firestore mapped to port `8085`:
     ```json
     "emulators": {
       "auth": { "port": 9099 },
       "firestore": { "port": 8085 },
       "ui": { "enabled": true, "port": 4000 },
       "singleProjectMode": true
     }
     ```
3. **Test Port Alignment**:
   - [src/lib/firebase/rules.test.ts:L29-L31](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/firebase/rules.test.ts#L29-L31) reads `process.env.FIRESTORE_EMULATOR_HOST` and defaults to port `8085`:
     ```typescript
     const host = process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1';
     const port = parseInt(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || '8085', 10);
     ```
4. **Execution Mechanism**:
   - [package.json:L18](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package.json#L18) defines:
     `"test:rules:emulator": "npx firebase-tools emulators:exec --only firestore \"vitest run --project=rules\""`
   - `firebase-tools emulators:exec` starts the Firestore emulator process on port `8085`, injects `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085` into the child environment, executes `vitest run --project=rules`, and tears down the emulator process on completion.

### Execution Command

```powershell
npm run test:rules:emulator
```

### Raw Output & Blocking Error

```text
> study@0.0.1 test:rules:emulator
> npx firebase-tools emulators:exec --only firestore "vitest run --project=rules"

i  emulators: Shutting down emulators.

Error: Could not spawn `java -version`. Please make sure Java is installed and on your system PATH.
```

### Finding & Status

- **Result**: **BLOCKED** (Exit code 1).
- **Root Cause**: The Google Cloud Firestore Emulator is a Java application (`cloud-firestore-emulator.jar`) requiring a Java Runtime Environment (JRE/JDK 11+). Running `java -version` on the system fails (`CommandNotFoundException`).
- **Policy Compliance**: In accordance with instructions, no mocks, stubs, or test rewrites were substituted, and `firestore.rules` was not modified. The 8 security rules tests remain unexecuted live until Java is provisioned on the host.

---

## Task 2: Live Local-Tier Latency Benchmark

### Script Analysis (`evaluation/scripts/run_latency_benchmarks.py`)

1. **Measurement Mode Selection**:
   - Controlled in [evaluation/scripts/run_latency_benchmarks.py:L69](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/scripts/run_latency_benchmarks.py#L69) via `run_latency_benchmarks(num_runs=10, live_heavy_models=False, live_cloud_calls=True)`.
   - Local mode is set at [line 145](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/scripts/run_latency_benchmarks.py#L145):
     `local_mode = "LIVE_EMPIRICAL" if "RAG" in op else ("LIVE_EMPIRICAL" if live_heavy_models else "MODELLED_PROJECTION")`.
   - **Key Finding**: In the existing benchmarking script ([lines 167–182](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/scripts/run_latency_benchmarks.py#L167-L182)), even if `live_heavy_models=True`, the code for Course Outline, Lesson, Quiz, First Token, and Full Response did **not** invoke the models; it generated synthetic Gaussian random variations around fixed baseline constants (`12.45s`, `22.80s`, `8.95s`, `0.650s`, `6.85s`).
2. **Prerequisites for Live Run**:
   - **Services**: FastAPI ML backend (`uvicorn main:app --port 8000 --host 127.0.0.1`) must be up and serving.
   - **Environment Variables**: `ML_BACKEND_API_KEY` (configured in [ml_backend/.env:L6](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/.env#L6)), `FAISS_INDEX_PATH`, `FAISS_DOCS_PATH`, and model IDs (`OUTLINE_MODEL_ID`, `LESSON_MODEL_ID`, `QUIZ_QG_MODEL_ID`, `QUIZ_DG_MODEL_ID`, `CHAT_MODEL_ID`, `EMBED_MODEL_ID`).
   - **Model Serving**: Backend must serve real model weights in memory on CPU with INT8 dynamic quantization.

### Backend Startup & Model Warmup

Executed:

```powershell
& "c:\Users\USER\Downloads\Telegram Desktop\Study\.venv\Scripts\python.exe" -u -m uvicorn main:app --port 8000 --host 127.0.0.1
```

**Startup Log Verification**:

- `summarizer`: `google/flan-t5-base` loaded & quantized (INT8).
- `paraphraser`: `google/flan-t5-base` loaded & quantized (INT8).
- `outline_generator`: `google/flan-t5-base` loaded & quantized (INT8).
- `lesson_generator`: `google/flan-t5-base` loaded & quantized (INT8).
- `quiz_pipeline`: `valhalla/t5-small-qg-prepend` & `potsawee/t5-large-generation-race-Distractor` loaded & quantized (INT8).
- `chat_assistant`: `TinyLlama/TinyLlama-1.1B-Chat-v1.0` loaded & quantized (INT8).
- `GET /healthcheck` status after warmup:
  ```json
  {
  	"status": "ok",
  	"ready": true,
  	"models_loaded": {
  		"summarizer": true,
  		"paraphraser": true,
  		"outline_generator": true,
  		"lesson_generator": true,
  		"quiz_pipeline": true,
  		"chat_assistant": true,
  		"rag_index": true
  	},
  	"inference_busy": false,
  	"errors": null,
  	"model_provenance": {
  		"system_mode": "fine_tuned_production",
  		"fine_tuned_count": 2,
  		"base_count": 3,
  		"specialized_count": 3
  	}
  }
  ```

### Live Empirical Timing Results & Failures

#### 1. Course Outline Generation (`POST /outline`)

- **Status**: **SUCCESS**
- **Payload**: `{"topic": "Database Systems", "module_count": 4, "format": "lessons_and_quizzes"}`
- **Measured Live Latency**: **15.438 seconds** (uncached transformer inference)
- **Log Verification**:
  ```text
  INFO:main:[POST] /outline - status=200 - duration=15437.55ms [req_id=c4981dad-5645-4f9e-b263-102701b3e9af]
  ```

#### 2. Quiz Generation (`POST /quiz`)

- **Status**: **SUCCESS**
- **Payload**: Dijkstra's algorithm topic, learning objective, key points, lesson context.
- **Measured Live Latency**: **16.888 seconds** (uncached QG + DG two-stage inference)
- **Log Verification**:
  ```text
  INFO:main:[POST] /quiz - status=200 - duration=16888.27ms [req_id=58c24dfb-5dba-4487-b9c3-cfb27d66dd42]
  ```

#### 3. Lesson Generation (`POST /lesson`)

- **Status**: **FAILED (HTTP 500)**
- **Payload**: `course_title="Data Structures"`, `module_title="Binary Search Trees"`, `key_points=["Binary tree properties", ...]`
- **Duration before failure**: 12.342 seconds
- **Raw Error Output**:
  ```text
  WARNING:models.lesson_generator:Lesson generation failed for module 'Binary Search Trees', page 0 ('Binary tree properties'): generated text too short (4 words, 28 chars). Fast-failing for upstream fallback.
  ERROR:main:[req_id=978f99cf-a80f-4f4c-ae83-5f51587ae97d] Lesson generation error: Lesson generation produced insufficient content for key point 'Binary tree properties' (4 words).
  Traceback (most recent call last):
    File ".../ml_backend/main.py", line 762, in lesson
    File ".../ml_backend/models/lesson_generator.py", line 112, in generate_lesson
      raise RuntimeError(
  RuntimeError: Lesson generation produced insufficient content for key point 'Binary tree properties' (4 words).
  INFO:main:[POST] /lesson - status=500 - duration=12342.41ms [req_id=978f99cf-a80f-4f4c-ae83-5f51587ae97d]
  ```
- **Root Cause**: `LESSON_MODEL_ID` is set to `google/flan-t5-base` in `ml_backend/.env`. The model generated only 4 words for the first key point, violating the minimum threshold (`word_count < 40` or `len(body) < 200` in [ml_backend/models/lesson_generator.py:L107-L114](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/lesson_generator.py#L107-L114)), which immediately aborts with `RuntimeError`.

#### 4. Chat Assistant (`POST /chat`)

- **Status**: **FAILED (HTTP 503)**
- **Payload**: Operating systems virtual memory prompt (`messages=[{"role": "user", "content": "..."}]`)
- **Duration before failure**: 368.2 ms
- **Raw Error Output**:
  ```text
  WARNING:main:Chat model not ready: qlinear_dynamic (ONEDNN): data type of input should be float.
  INFO:main:[POST] /chat - status=503 - duration=368.2ms [req_id=fcd8cf32-9869-4439-8c6e-11b9200689c6]
  INFO: 127.0.0.1:57759 - "POST /chat HTTP/1.1" 503 Service Unavailable
  ```
- **Root Cause**: PyTorch dynamic INT8 quantization (`torch.ao.quantization.quantize_dynamic` applied to `torch.nn.Linear` in [ml_backend/models/model_registry.py:L204-L211](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/model_registry.py#L204-L211)) triggers a tensor data type incompatibility with the ONEDNN backend on CPU when executing TinyLlama (`qlinear_dynamic (ONEDNN): data type of input should be float`), causing the endpoint to catch the exception and reject with 503.

### Data Preservation Decision

Per instructions: _"If the models cannot be loaded or a run cannot complete, report what failed and leave the projected values in place rather than overwriting them with partial data."_

Because 2 of the 4 autoregressive operations (Lesson and Chat) cannot complete without modifying backend application logic, the projected values in [evaluation/results/latency_summary.json](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/results/latency_summary.json) and [evaluation/results/latency_benchmarks.csv](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/results/latency_benchmarks.csv) were **preserved intact** rather than overwritten with incomplete or fabricated measurements.

---

## Configuration Changes Made

| File Path                                                                                 | Lines   | Change Description                                        | Rationale                                                                        |
| :---------------------------------------------------------------------------------------- | :------ | :-------------------------------------------------------- | :------------------------------------------------------------------------------- |
| [package.json](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package.json#L38) | Line 38 | Added `"firebase-tools": "^15.30.0"` to `devDependencies` | Satisfy prerequisite requirement to ensure `firebase-tools` is installed locally |
| `package-lock.json`                                                                       | -       | Updated dependency graph for `firebase-tools`             | Lockfile synchronization following `npm install -D firebase-tools`               |

No application logic, models, or security rules files were altered.

---

## Explicit List of Incomplete Tasks

1. **Firestore Security Rules Emulator Run**:
   - **Could not complete**: Execution of the 8 rules unit tests against the Firestore emulator.
   - **Reason**: The Firestore emulator requires Java on PATH; Java is not installed in the Windows environment (`Error: Could not spawn 'java -version'`).
2. **Local-Tier Latency Live Overwrite (10 Iterations across 4 Autoregressive Operations)**:
   - **Could not complete**: Full 10-run live latency benchmark matrix replacement for all 4 operations.
   - **Reason**:
     - Outline (15.44s) and Quiz (16.89s) execute live, but Lesson Generation consistently fails with HTTP 500 (`RuntimeError: insufficient content (4 words)` from `flan-t5-base`), and Chat Assistant consistently fails with HTTP 503 (`qlinear_dynamic (ONEDNN): data type of input should be float` due to INT8 quantization crash in PyTorch on CPU).
     - Per explicit directive, projected figures were preserved to prevent corrupting the dataset with partial numbers.
