"""
Data helper script for fine-tuning dataset management.

Usage:
  1. Validate datasets:
     python prepare_data.py --validate

  2. Append a new summarization record:
     python prepare_data.py --add-summarization --input "Lecture note..." --output "Summary..."

  3. Append a new paraphrasing record:
     python prepare_data.py --add-paraphrasing --input "Original..." --output "Paraphrased..." --style academic
"""

import argparse
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
SUMMARIZATION_FILE = DATA_DIR / "summarization.jsonl"
PARAPHRASING_FILE = DATA_DIR / "paraphrasing.jsonl"


def validate_file(file_path: Path, required_keys: list[str]):
    print(f"\n--- Validating {file_path.name} ---")
    if not file_path.exists():
        print(f"Error: {file_path} does not exist.")
        return

    valid_count = 0
    invalid_count = 0
    with open(file_path, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
                missing = [k for k in required_keys if k not in record]
                if missing:
                    print(f"Line {idx}: Missing keys {missing}")
                    invalid_count += 1
                elif not record["input"].strip() or not record["output"].strip():
                    print(f"Line {idx}: Empty input or output field.")
                    invalid_count += 1
                else:
                    valid_count += 1
            except json.JSONDecodeError as e:
                print(f"Line {idx}: Invalid JSON syntax - {e}")
                invalid_count += 1

    print(f"Result: {valid_count} valid records, {invalid_count} errors.")


def append_record(file_path: Path, record: dict):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    print(f"Successfully added 1 record to {file_path.name}")


def main():
    parser = argparse.ArgumentParser(description="Dataset management tool for fine-tuning.")
    parser.add_argument("--validate", action="store_true", help="Validate existing JSONL files.")
    parser.add_argument("--fetch-hf", action="store_true", help="Fetch and format Hugging Face open datasets (SciQ, SAMSum) for fine-tuning.")
    parser.add_argument("--add-summarization", action="store_true", help="Add summarization example.")
    parser.add_argument("--add-paraphrasing", action="store_true", help="Add paraphrasing example.")
    parser.add_argument("--input", type=str, help="Input text from lecture notes or exam paper.")
    parser.add_argument("--output", type=str, help="Target summary or rephrased output.")
    parser.add_argument("--style", type=str, default="academic", choices=["academic", "simple", "formal"], help="Style for paraphrasing.")

    args = parser.parse_args()

    if args.validate:
        validate_file(SUMMARIZATION_FILE, ["input", "output"])
        validate_file(PARAPHRASING_FILE, ["input", "output", "style"])
        try:
            from prepare_outline_data import validate_outline_file
            validate_outline_file()
        except ImportError:
            pass
        try:
            from prepare_lesson_data import validate_lesson_file
            validate_lesson_file()
        except ImportError:
            pass
    elif args.fetch_hf:
        from prepare_hf_datasets import main as fetch_hf_main
        fetch_hf_main()
    elif args.add_summarization:
        if not args.input or not args.output:
            print("Error: Both --input and --output are required.")
            return
        append_record(SUMMARIZATION_FILE, {"input": args.input.strip(), "output": args.output.strip()})
    elif args.add_paraphrasing:
        if not args.input or not args.output:
            print("Error: Both --input and --output are required.")
            return
        append_record(PARAPHRASING_FILE, {
            "input": args.input.strip(),
            "output": args.output.strip(),
            "style": args.style
        })
    else:
        parser.print_help()


if __name__ == "__main__":
    main()

