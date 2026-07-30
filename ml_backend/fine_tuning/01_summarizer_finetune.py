"""
Fine-tuning script: flan-t5-base for text summarization.

Run this on Google Colab (Free T4 GPU) — takes ~1-2 hours.

Instructions:
  1. Upload your summarization.jsonl training data to Colab
  2. Run this script: python 01_summarizer_finetune.py
  3. After training, the model is saved to ./flan-t5-study-summarizer/
  4. Upload to HuggingFace Hub:
       from huggingface_hub import HfApi
       api = HfApi()
       api.upload_folder(folder_path="./flan-t5-study-summarizer", repo_id="YOUR_USERNAME/flan-t5-study-summarizer")
  5. Set SUMMARIZER_MODEL_ID=YOUR_USERNAME/flan-t5-study-summarizer in ml_backend/.env

Training data format (summarization.jsonl):
  {"input": "Long study text here...", "output": "Concise summary here."}

Evaluation metric: ROUGE-L (higher is better; target ≥ 5% improvement over base).
"""

import json
import os
from pathlib import Path

# Install on Colab: !pip install transformers datasets evaluate rouge_score
from transformers import (
    AutoTokenizer,
    AutoModelForSeq2SeqLM,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    DataCollatorForSeq2Seq,
)
from datasets import Dataset
import evaluate

# ── Config ─────────────────────────────────────────────────────────────────────
BASE_MODEL = "google/flan-t5-base"
DATA_PATH = Path("data/summarization.jsonl")
OUTPUT_DIR = "./flan-t5-study-summarizer"
MAX_INPUT_LENGTH = 512
MAX_TARGET_LENGTH = 150
BATCH_SIZE = 8
EPOCHS = 3
LEARNING_RATE = 5e-5

# ── Load Data ──────────────────────────────────────────────────────────────────

def load_jsonl(path: Path) -> list[dict]:
    records = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


# ── Preprocess ─────────────────────────────────────────────────────────────────

def preprocess(examples, tokenizer):
    prefix = "Summarize the following study material concisely:\n\n"
    inputs = [prefix + text for text in examples["input"]]

    model_inputs = tokenizer(
        inputs,
        max_length=MAX_INPUT_LENGTH,
        truncation=True,
        padding="max_length",
    )
    labels = tokenizer(
        text_target=examples["output"],
        max_length=MAX_TARGET_LENGTH,
        truncation=True,
        padding="max_length",
    )

    model_inputs["labels"] = labels["input_ids"]
    return model_inputs


# ── Metrics ────────────────────────────────────────────────────────────────────

def compute_metrics(eval_pred, tokenizer, rouge):
    predictions, labels = eval_pred
    decoded_preds = tokenizer.batch_decode(predictions, skip_special_tokens=True)
    labels = [[l for l in label if l != -100] for label in labels]
    decoded_labels = tokenizer.batch_decode(labels, skip_special_tokens=True)

    result = rouge.compute(predictions=decoded_preds, references=decoded_labels, use_stemmer=True)
    return {k: round(v * 100, 4) for k, v in result.items()}


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print(f"Loading base model: {BASE_MODEL}")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    model = AutoModelForSeq2SeqLM.from_pretrained(BASE_MODEL)

    print(f"Loading training data from: {DATA_PATH}")
    records = load_jsonl(DATA_PATH)
    print(f"Loaded {len(records)} training examples.")

    # Split 90/10 train/eval
    split = int(len(records) * 0.9)
    train_records = records[:split]
    eval_records = records[split:]

    train_ds = Dataset.from_list(train_records).map(
        lambda ex: preprocess(ex, tokenizer), batched=True, remove_columns=["input", "output"]
    )
    eval_ds = Dataset.from_list(eval_records).map(
        lambda ex: preprocess(ex, tokenizer), batched=True, remove_columns=["input", "output"]
    )

    rouge = evaluate.load("rouge")
    data_collator = DataCollatorForSeq2Seq(tokenizer, model=model, pad_to_multiple_of=8)

    training_args = Seq2SeqTrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        learning_rate=LEARNING_RATE,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        predict_with_generate=True,
        fp16=True,  # Use FP16 on GPU (Colab T4)
        logging_dir="./logs",
        logging_steps=10,
        report_to="none",
    )

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=lambda ep: compute_metrics(ep, tokenizer, rouge),
    )

    print("Starting fine-tuning...")
    trainer.train()

    print(f"Saving fine-tuned model to {OUTPUT_DIR}")
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print("Done! Upload this directory to HuggingFace Hub.")


if __name__ == "__main__":
    main()
