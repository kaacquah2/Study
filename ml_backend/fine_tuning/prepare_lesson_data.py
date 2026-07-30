"""
Lesson Generator Dataset Preparation & Distillation Helper.

Generates or validates dataset records for lesson generator fine-tuning (google/flan-t5-large).
Target JSONL format (lessons.jsonl):
  {
    "course_title": "Data Structures in C++",
    "module_title": "Binary Search Trees",
    "learning_objective": "Understand BST insertion, deletion, and search complexity",
    "key_points": ["BST Node Structure", "In-order Traversal", "O(log n) Operations"],
    "output": "{\"pages\": [{\"order\": 0, \"heading\": \"Introduction to BST\", \"subheading\": \"Structure & Operations\", \"body\": \"# Binary Search Trees\\n\\nA BST is a hierarchical...\"}]}"
  }

Usage:
  python prepare_lesson_data.py --validate
  python prepare_lesson_data.py --generate-synthetic --count 15
"""

import argparse
import json
import os
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
LESSONS_FILE = DATA_DIR / "lessons.jsonl"

SAMPLE_LESSONS = [
    ("Data Structures in C++", "Binary Search Trees", "Understand BST insertion, deletion, and search complexity", ["BST Node Structure", "In-order Traversal", "O(log n) Operations"]),
    ("Operating Systems", "Page Tables & Virtual Memory", "Master page table translation, TLB hits/misses, and paging overhead", ["Virtual Address Translation", "TLB Caching", "Multi-level Page Tables"]),
    ("Computer Networks", "TCP 3-Way Handshake", "Examine connection establishment, sequence numbers, and teardown", ["SYN/ACK Packets", "Sequence Numbers", "TIME_WAIT State"]),
    ("Database Systems", "3NF Normalization", "Apply 1NF, 2NF, and 3NF functional dependencies to remove anomalies", ["First Normal Form", "Transitive Dependencies", "Boyce-Codd Normal Form"]),
    ("Machine Learning", "Gradient Descent & Backpropagation", "Understand loss minimization, learning rate, and chain rule derivative updates", ["Loss Functions", "Learning Rate Alpha", "Chain Rule Backprop"]),
]

def generate_synthetic_lesson_via_gemini(course_title: str, module_title: str, learning_objective: str, key_points: list[str]) -> dict | None:
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return None

    try:
        import httpx
        prompt = f"""Generate a structured multi-page lesson in JSON for:
Course: {course_title}
Module: {module_title}
Objective: {learning_objective}
Key Points: {', '.join(key_points)}

Output ONLY valid JSON with key:
"pages": list of objects each having:
  "order": integer (0-indexed),
  "heading": string,
  "subheading": string or null,
  "body": markdown string (clear educational content explaining concepts in detail).
Generate 3 distinct pages.
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
            parsed = json.loads(raw_json)
            return {
                "course_title": course_title,
                "module_title": module_title,
                "learning_objective": learning_objective,
                "key_points": key_points,
                "output": json.dumps(parsed, ensure_ascii=False)
            }
    except Exception as e:
        print(f"Gemini synthetic lesson distillation skipped for '{module_title}': {e}")
    return None

def generate_template_lesson(course_title: str, module_title: str, learning_objective: str, key_points: list[str]) -> dict:
    pages = [
        {
            "order": 0,
            "heading": f"Introduction to {module_title}",
            "subheading": "Overview & Core Concepts",
            "body": f"# {module_title}\n\nWelcome to **{module_title}** in *{course_title}*.\n\n### Learning Objective\n{learning_objective}\n\n### Key Concepts\n" + "\n".join([f"- **{kp}**: Essential concept in {module_title}." for kp in key_points])
        },
        {
            "order": 1,
            "heading": f"Deep Dive: {key_points[0] if key_points else module_title}",
            "subheading": "Mechanisms & Implementation",
            "body": f"## Detailed Breakdown of {key_points[0] if key_points else module_title}\n\nUnderstanding how {module_title} operates under the hood is critical for practical application.\n\n```cpp\n// Conceptual representation of {module_title}\nvoid execute_{module_title.lower().replace(' ', '_')}() {{\n    // Core logic\n}}\n```\n\n- Key takeaway 1: Ensure proper initialization.\n- Key takeaway 2: Observe performance implications."
        },
        {
            "order": 2,
            "heading": "Summary & Practical Applications",
            "subheading": "Review & Best Practices",
            "body": f"## Summary of {module_title}\n\nIn this lesson, we covered the fundamental principles of **{module_title}**.\n\n- Primary objective achieved: {learning_objective}.\n- Review key concepts before taking the module quiz!"
        }
    ]
    return {
        "course_title": course_title,
        "module_title": module_title,
        "learning_objective": learning_objective,
        "key_points": key_points,
        "output": json.dumps({"pages": pages}, ensure_ascii=False)
    }

def validate_lesson_file():
    print(f"\n--- Validating {LESSONS_FILE.name} ---")
    if not LESSONS_FILE.exists():
        print(f"Error: {LESSONS_FILE} does not exist.")
        return

    valid = 0
    errors = 0
    with open(LESSONS_FILE, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                missing = [k for k in ["course_title", "module_title", "learning_objective", "key_points", "output"] if k not in rec]
                if missing:
                    print(f"Line {idx}: Missing keys {missing}")
                    errors += 1
                else:
                    out_obj = json.loads(rec["output"])
                    if "pages" in out_obj and isinstance(out_obj["pages"], list):
                        valid += 1
                    else:
                        print(f"Line {idx}: Output missing valid pages array.")
                        errors += 1
            except Exception as e:
                print(f"Line {idx}: Invalid syntax - {e}")
                errors += 1
    print(f"Result: {valid} valid records, {errors} errors.")

def main():
    parser = argparse.ArgumentParser(description="Prepare dataset for Lesson Generator fine-tuning.")
    parser.add_argument("--validate", action="store_true", help="Validate lessons.jsonl file.")
    parser.add_argument("--generate-synthetic", action="store_true", help="Synthesize lesson dataset examples.")
    parser.add_argument("--count", type=int, default=10, help="Number of synthetic records to generate.")
    args = parser.parse_args()

    if args.validate:
        validate_lesson_file()
        return

    if args.generate_synthetic:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        count = 0
        with open(LESSONS_FILE, "a", encoding="utf-8") as f:
            for i in range(args.count):
                sample = SAMPLE_LESSONS[i % len(SAMPLE_LESSONS)]
                ct, mt, lo, kp = sample
                rec = generate_synthetic_lesson_via_gemini(ct, mt, lo, kp)
                if not rec:
                    rec = generate_template_lesson(ct, mt, lo, kp)
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                count += 1
        print(f"Successfully appended {count} records to {LESSONS_FILE.name}")
        validate_lesson_file()

if __name__ == "__main__":
    main()
