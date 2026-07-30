"""
Outline Generator Dataset Preparation & Distillation Helper.

Generates or validates dataset records for course outline fine-tuning (google/flan-t5-large).
Target JSONL format (outlines.jsonl):
  {
    "topic": "Operating System Memory Management & Page Tables",
    "module_count": 4,
    "format": "lessons_and_quizzes",
    "output": "{\"title\": \"Operating System Memory Management\", \"description\": \"...\", \"modules\": [...]}"
  }

Usage:
  python prepare_outline_data.py --validate
  python prepare_outline_data.py --generate-synthetic --count 20
"""

import argparse
import json
import os
import random
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
OUTLINES_FILE = DATA_DIR / "outlines.jsonl"

SAMPLE_TOPICS = [
    ("Data Structures and Algorithms in C++", 4, "lessons_and_quizzes"),
    ("Operating System Memory Management & Page Tables", 4, "lessons_and_quizzes"),
    ("TCP/IP Protocol Suite and Socket Programming", 5, "lessons_and_quizzes"),
    ("Relational Database Design, SQL, and 3NF Normalization", 4, "lessons_and_quizzes"),
    ("RISC vs CISC CPU Architecture & Memory Hierarchy", 4, "lessons_and_quizzes"),
    ("Discrete Math: Propositional Logic and Graph Theory", 4, "lessons_and_quizzes"),
    ("Linear Algebra: Matrices, Eigenvalues & Vectors", 5, "lessons_and_quizzes"),
    ("Introduction to Machine Learning & Neural Networks", 4, "lessons_and_quizzes"),
    ("Python Web Development with FastAPI & Pydantic", 4, "lessons_and_quizzes"),
    ("Cybersecurity Fundamentals: Cryptography & PKI", 4, "lessons_and_quizzes"),
    ("Organic Chemistry: Functional Groups & Reaction Mechanisms", 4, "lessons_and_quizzes"),
    ("Macroeconomics: Inflation, GDP & Monetary Policy", 4, "lessons_and_quizzes"),
    ("World History: Causes & Consequences of WWI", 3, "lessons_and_quizzes"),
    ("Cell Biology: Organelles, Mitosis & Cellular Respiration", 4, "lessons_and_quizzes"),
    ("Physics: Classical Mechanics & Newton's Laws", 4, "lessons_and_quizzes"),
]

def generate_synthetic_record_via_gemini(topic: str, module_count: int, fmt: str) -> dict | None:
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return None

    try:
        import httpx
        prompt = f"""Generate a high-quality educational course outline in JSON for:
Topic: {topic}
Module Count: {module_count}
Format: {fmt}

Output ONLY valid JSON with keys:
"title": string,
"description": string,
"modules": list of objects each having:
  "order": integer (0 to {module_count-1}),
  "type": "lesson" or "quiz",
  "title": string,
  "summary": string (max 100 chars),
  "learningObjective": string,
  "keyPoints": list of 3 strings.
"""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key={api_key}"
        body = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"}
        }
        res = httpx.post(url, json=body, timeout=30.0)
        if res.status_code == 200:
            data = res.json()
            raw_json = data["candidates"][0]["content"]["parts"][0]["text"]
            # Validate JSON string
            parsed = json.loads(raw_json)
            return {
                "topic": topic,
                "module_count": module_count,
                "format": fmt,
                "output": json.dumps(parsed, ensure_ascii=False)
            }
    except Exception as e:
        print(f"Gemini synthetic distillation skipped for '{topic}': {e}")
    return None

def generate_template_record(topic: str, module_count: int, fmt: str) -> dict:
    subtopics = [
        ("Fundamentals & Core Definitions", "Introduction and foundational concepts."),
        ("Core Mechanisms & Principles", "In-depth breakdown of key operational principles."),
        ("Practical Applications & Case Studies", "Applied scenarios and real-world implementation."),
        ("Advanced Topics & Problem Solving", "Complex challenges and optimization techniques."),
        ("Synthesis & Comprehensive Review", "Summary of integrated concepts.")
    ]
    modules = []
    for i in range(module_count):
        st_title, st_summary = subtopics[i % len(subtopics)]
        mod_type = "quiz" if (fmt == "quizzes_only" or (i > 0 and i % 3 == 2)) else "lesson"
        modules.append({
            "order": i,
            "type": mod_type,
            "title": f"{st_title} in {topic}",
            "summary": f"{st_summary} for {topic}."[:100],
            "learningObjective": f"Master the core elements of {st_title.lower()} within {topic}.",
            "keyPoints": [
                f"Core definition of {st_title.lower()}",
                f"Key mechanics of {st_title.lower()} in {topic}",
                f"Practical analysis of {st_title.lower()}"
            ]
        })
    outline_data = {
        "title": f"Fundamentals of {topic}",
        "description": f"A comprehensive educational course covering {topic}.",
        "modules": modules
    }
    return {
        "topic": topic,
        "module_count": module_count,
        "format": fmt,
        "output": json.dumps(outline_data, ensure_ascii=False)
    }

def validate_outline_file():
    print(f"\n--- Validating {OUTLINES_FILE.name} ---")
    if not OUTLINES_FILE.exists():
        print(f"Error: {OUTLINES_FILE} does not exist.")
        return

    valid = 0
    errors = 0
    with open(OUTLINES_FILE, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                missing = [k for k in ["topic", "module_count", "format", "output"] if k not in rec]
                if missing:
                    print(f"Line {idx}: Missing keys {missing}")
                    errors += 1
                else:
                    out_obj = json.loads(rec["output"])
                    if "modules" in out_obj and isinstance(out_obj["modules"], list):
                        valid += 1
                    else:
                        print(f"Line {idx}: Output missing valid modules array.")
                        errors += 1
            except Exception as e:
                print(f"Line {idx}: Invalid syntax - {e}")
                errors += 1
    print(f"Result: {valid} valid records, {errors} errors.")

def main():
    parser = argparse.ArgumentParser(description="Prepare dataset for Outline Generator fine-tuning.")
    parser.add_argument("--validate", action="store_true", help="Validate outlines.jsonl file.")
    parser.add_argument("--generate-synthetic", action="store_true", help="Synthesize outline dataset examples.")
    parser.add_argument("--count", type=int, default=15, help="Number of synthetic records to generate.")
    args = parser.parse_args()

    if args.validate:
        validate_outline_file()
        return

    if args.generate_synthetic:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        count = 0
        with open(OUTLINES_FILE, "a", encoding="utf-8") as f:
            for i in range(args.count):
                top_sample = SAMPLE_TOPICS[i % len(SAMPLE_TOPICS)]
                topic, m_count, fmt = top_sample
                rec = generate_synthetic_record_via_gemini(topic, m_count, fmt)
                if not rec:
                    rec = generate_template_record(topic, m_count, fmt)
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                count += 1
        print(f"Successfully appended {count} records to {OUTLINES_FILE.name}")
        validate_outline_file()

if __name__ == "__main__":
    main()
