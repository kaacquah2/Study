"""
Hugging Face Open Dataset Loader for Model Fine-Tuning.

Pulls CC / Open-Licensed educational datasets from Hugging Face Hub (SciQ, SAMSum, SQuAD 2.0)
and formats them into training JSONL files for FLAN-T5 summarization and paraphrasing.

Usage:
    cd ml_backend/fine_tuning
    python prepare_hf_datasets.py --dataset all
"""

import argparse
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
SUMMARIZATION_FILE = DATA_DIR / "summarization.jsonl"
PARAPHRASING_FILE = DATA_DIR / "paraphrasing.jsonl"


def append_jsonl(file_path: Path, records: list[dict]):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(file_path, "a", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    logger.info(f"✓ Appended {len(records)} records to {file_path.name}")


def prepare_sciq_data(max_samples: int = 500):
    """Transform SciQ dataset (allenai/sciq - CC-BY-NC-3.0) into summarization & Q&A fine-tuning pairs."""
    logger.info("Loading SciQ dataset from Hugging Face (allenai/sciq)...")
    try:
        from datasets import load_dataset
        ds = load_dataset("allenai/sciq", split="train")
    except Exception as e:
        logger.error(f"Failed to load allenai/sciq: {e}")
        return

    logger.info(f"Processing up to {max_samples} samples from SciQ...")
    sum_records = []
    para_records = []

    count = 0
    for sample in ds:
        q = (sample.get("question") or "").strip()
        ans = (sample.get("correct_answer") or "").strip()
        supp = (sample.get("support") or "").strip()

        if not q or not ans or not supp:
            continue

        # Format summarization pair: Support text -> Key explanation summary
        input_text = f"Context: {supp}\nQuestion: {q}"
        output_text = f"Answer: {ans}. Explanation: {supp}"
        sum_records.append({"input": input_text, "output": output_text})

        # Format paraphrasing pair: Standard question -> Academic query format
        para_records.append({
            "input": f"Explain: {q}",
            "output": f"Provide a detailed analysis of {q.lower().rstrip('?')} with reference to {ans}.",
            "style": "academic"
        })

        count += 1
        if count >= max_samples:
            break

    if sum_records:
        append_jsonl(SUMMARIZATION_FILE, sum_records)
    if para_records:
        append_jsonl(PARAPHRASING_FILE, para_records)


def prepare_samsum_data(max_samples: int = 300):
    """Load dialogue summarization dataset (samsum) for study note summarization."""
    logger.info("Loading SAMSum dataset from Hugging Face (samsum)...")
    try:
        from datasets import load_dataset
        ds = load_dataset("samsum", split="train")
    except Exception as e:
        logger.warning(f"Could not load samsum dataset ({e}), skipping SAMSum ingestion.")
        return

    records = []
    count = 0
    for sample in ds:
        dialogue = (sample.get("dialogue") or "").strip()
        summary = (sample.get("summary") or "").strip()
        if dialogue and summary:
            records.append({"input": dialogue, "output": summary})
            count += 1
            if count >= max_samples:
                break

    if records:
        append_jsonl(SUMMARIZATION_FILE, records)


def main(dataset: str = "all", limit: int = 300):
    if __name__ == "__main__":
        parser = argparse.ArgumentParser(description="Prepare open HF datasets for fine-tuning.")
        parser.add_argument("--dataset", choices=["sciq", "samsum", "all"], default="all", help="Dataset to fetch and process.")
        parser.add_argument("--limit", type=int, default=300, help="Maximum samples per dataset.")
        args = parser.parse_args()
        dataset = args.dataset
        limit = args.limit

    if dataset in ["sciq", "all"]:
        prepare_sciq_data(max_samples=limit)
    if dataset in ["samsum", "all"]:
        prepare_samsum_data(max_samples=limit)

    logger.info("Done preparing Hugging Face open datasets.")


if __name__ == "__main__":
    main()

