"""
Standalone One-Click Google Colab Fine-Tuner for AI Study Buddy.

This script is 100% self-contained. It can be copy-pasted into a single Google Colab cell.
It automatically:
  1. Installs all required ML dependencies (transformers, datasets, evaluate, etc.)
  2. Ingests Hugging Face allenai/sciq open dataset into summarization & paraphrasing pairs
  3. Fine-tunes google/flan-t5-base for Text Summarization & Academic Paraphrasing on GPU
  4. Evaluates model performance (ROUGE & BLEU scores)
  5. Saves trained weights to ./flan-t5-study-summarizer/ & ./flan-t5-study-paraphraser/

Usage in Google Colab:
  !python colab_finetune_all.py
"""

import sys
import subprocess
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Step 1: Install required dependencies automatically if missing
required_pkgs = ["transformers", "datasets", "evaluate", "rouge_score", "sacrebleu", "accelerate"]
logger.info("Verifying required fine-tuning packages...")
for pkg in required_pkgs:
    try:
        __import__(pkg)
    except ImportError:
        logger.info(f"Installing missing package: {pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pkg])

import torch
from transformers import (
    AutoTokenizer,
    AutoModelForSeq2SeqLM,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    DataCollatorForSeq2Seq,
)
from datasets import Dataset
import evaluate

device = "cuda" if torch.cuda.is_available() else "cpu"
logger.info(f"Using execution device: {device} (CUDA available: {torch.cuda.is_available()})")


# Step 2: Self-contained Open Dataset Ingestion (allenai/sciq)
def generate_training_data():
    logger.info("Downloading allenai/sciq dataset from Hugging Face...")
    from datasets import load_dataset
    sciq = load_dataset("allenai/sciq", split="train")

    sum_records = []
    para_records = []

    for idx, sample in enumerate(sciq):
        if idx >= 400:
            break
        q = (sample.get("question") or "").strip()
        ans = (sample.get("correct_answer") or "").strip()
        supp = (sample.get("support") or "").strip()

        if not q or not ans or not supp:
            continue

        # Summarization pair
        sum_records.append({
            "input": f"Summarize the following study material concisely:\n\nContext: {supp}\nQuestion: {q}",
            "output": f"Answer: {ans}. Explanation: {supp}"
        })

        # Paraphrasing pair
        para_records.append({
            "input": f"Paraphrase the following sentence in a formal academic style:\n\nExplain: {q}",
            "output": f"Provide a detailed academic breakdown of {q.lower().rstrip('?')} with reference to {ans}."
        })

    logger.info(f"Prepared {len(sum_records)} summarization and {len(para_records)} paraphrasing training examples.")
    return sum_records, para_records


# Step 3: Fine-Tuning Execution Function
def train_model(base_model_name: str, records: list[dict], output_dir: str, metric_name: str, max_in_len: int = 512, max_out_len: int = 150):
    logger.info(f"Starting fine-tuning for {output_dir} using base model {base_model_name}...")
    tokenizer = AutoTokenizer.from_pretrained(base_model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(base_model_name)

    split = int(len(records) * 0.9)
    train_records = records[:split]
    eval_records = records[split:]

    def preprocess_fn(examples):
        model_inputs = tokenizer(
            examples["input"],
            max_length=max_in_len,
            truncation=True,
            padding="max_length"
        )
        labels = tokenizer(
            text_target=examples["output"],
            max_length=max_out_len,
            truncation=True,
            padding="max_length"
        )
        model_inputs["labels"] = labels["input_ids"]
        return model_inputs

    train_ds = Dataset.from_list(train_records).map(preprocess_fn, batched=True)
    eval_ds = Dataset.from_list(eval_records).map(preprocess_fn, batched=True)

    metric = evaluate.load(metric_name)
    data_collator = DataCollatorForSeq2Seq(tokenizer, model=model, pad_to_multiple_of=8)

    training_args = Seq2SeqTrainingArguments(
        output_dir=output_dir,
        num_train_epochs=3,
        per_device_train_batch_size=8 if torch.cuda.is_available() else 2,
        per_device_eval_batch_size=8 if torch.cuda.is_available() else 2,
        learning_rate=5e-5,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        predict_with_generate=True,
        fp16=torch.cuda.is_available(),
        logging_steps=10,
        report_to="none",
    )

    def compute_metrics_fn(eval_pred):
        predictions, labels = eval_pred
        decoded_preds = tokenizer.batch_decode(predictions, skip_special_tokens=True)
        labels = [[l for l in label if l != -100] for label in labels]
        decoded_labels = tokenizer.batch_decode(labels, skip_special_tokens=True)
        if metric_name == "rouge":
            res = metric.compute(predictions=decoded_preds, references=decoded_labels, use_stemmer=True)
            return {k: round(v * 100, 4) for k, v in res.items()}
        else:
            res = metric.compute(predictions=decoded_preds, references=[[r] for r in decoded_labels])
            return {"bleu": round(res["bleu"] * 100, 4)}

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics_fn,
    )

    trainer.train()
    logger.info(f"Saving fine-tuned model weights to {output_dir}...")
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    logger.info(f"✓ Successfully fine-tuned and saved {output_dir}")


def main():
    logger.info("=== Starting Google Colab Self-Contained Fine-Tuner ===")
    sum_data, para_data = generate_training_data()

    # 1. Train Summarizer
    train_model(
        base_model_name="google/flan-t5-base",
        records=sum_data,
        output_dir="./flan-t5-study-summarizer",
        metric_name="rouge",
        max_in_len=512,
        max_out_len=150
    )

    # 2. Train Paraphraser
    train_model(
        base_model_name="google/flan-t5-base",
        records=para_data,
        output_dir="./flan-t5-study-paraphraser",
        metric_name="sacrebleu",
        max_in_len=256,
        max_out_len=256
    )

    logger.info("🎉 All models successfully fine-tuned! Output directories: ./flan-t5-study-summarizer & ./flan-t5-study-paraphraser")


if __name__ == "__main__":
    main()
