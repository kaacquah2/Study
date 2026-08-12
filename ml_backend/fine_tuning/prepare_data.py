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


def show_dataset_stats():
    print("\n================ Fine-Tuning Dataset Metrics Summary ================")
    jsonl_files = sorted(list(DATA_DIR.glob("*.jsonl"))) if DATA_DIR.exists() else []
    if not jsonl_files:
        print("No fine-tuning dataset files (.jsonl) found in ml_backend/fine_tuning/data/.")
        return

    total_records = 0
    for file_path in jsonl_files:
        record_count = 0
        total_input_words = 0
        total_output_words = 0
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    inp_words = len(data.get("input", "").split())
                    out_words = len(data.get("output", "").split())
                    record_count += 1
                    total_input_words += inp_words
                    total_output_words += out_words
                except Exception:
                    pass

        avg_inp = round(total_input_words / record_count, 1) if record_count else 0
        avg_out = round(total_output_words / record_count, 1) if record_count else 0
        total_records += record_count
        print(f" • {file_path.name:<25}: {record_count:>5} records | Avg Input: {avg_inp:>5} words | Avg Output: {avg_out:>5} words")

    print(f"Total Fine-Tuning Corpus Size: {total_records} records across {len(jsonl_files)} dataset files.")
    print("====================================================================")


def main():
    parser = argparse.ArgumentParser(description="Dataset management tool for fine-tuning.")
    parser.add_argument("--validate", action="store_true", help="Validate existing JSONL files.")
    parser.add_argument("--stats", action="store_true", help="Report summary metrics across all fine-tuning dataset files.")
    parser.add_argument("--fetch-hf", action="store_true", help="Fetch and format Hugging Face open datasets (SciQ, SAMSum) for fine-tuning.")
    parser.add_argument("--add-summarization", action="store_true", help="Add summarization example.")
    parser.add_argument("--add-paraphrasing", action="store_true", help="Add paraphrasing example.")
    parser.add_argument("--input", type=str, help="Input text from lecture notes or exam paper.")
    parser.add_argument("--output", type=str, help="Target summary or rephrased output.")
    parser.add_argument("--style", type=str, default="academic", choices=["academic", "simple", "formal"], help="Style for paraphrasing.")

    args = parser.parse_args()

    if args.stats:
        show_dataset_stats()
    elif args.validate:
        validate_file(SUMMARIZATION_FILE, ["input", "output"])
        validate_file(PARAPHRASING_FILE, ["input", "output", "style"])
        import importlib
        try:
            try:
                mod_outline = importlib.import_module("fine_tuning.prepare_outline_data")
            except ImportError:
                mod_outline = importlib.import_module("prepare_outline_data")
            getattr(mod_outline, "validate_outline_file")()
        except (ImportError, AttributeError):
            pass
        try:
            try:
                mod_lesson = importlib.import_module("fine_tuning.prepare_lesson_data")
            except ImportError:
                mod_lesson = importlib.import_module("prepare_lesson_data")
            getattr(mod_lesson, "validate_lesson_file")()
        except (ImportError, AttributeError):
            pass
    elif args.fetch_hf:
        import importlib
        try:
            try:
                mod_hf = importlib.import_module("fine_tuning.prepare_hf_datasets")
            except ImportError:
                mod_hf = importlib.import_module("prepare_hf_datasets")
            getattr(mod_hf, "main")()
        except (ImportError, AttributeError):
            pass
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

