"""
Fine-tuning script: flan-t5-large for Course Outline Generation.

Run on Google Colab (Free T4 GPU) — takes ~1.5 - 3 hours.

Colab Setup:
  !pip install transformers datasets evaluate rouge_score accelerate

Instructions:
  1. Generate or upload data/outlines.jsonl
  2. Run: python 03_outline_finetune.py
  3. After training, model is saved to ./flan-t5-study-outline-generator/
  4. Upload to HuggingFace Hub:
       from huggingface_hub import HfApi
       api = HfApi()
       api.upload_folder(folder_path="./flan-t5-study-outline-generator", repo_id="YOUR_USERNAME/flan-t5-study-outline-generator")
  5. Set OUTLINE_MODEL_ID=YOUR_USERNAME/flan-t5-study-outline-generator in ml_backend/.env
"""

import json
from pathlib import Path
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
BASE_MODEL = "google/flan-t5-large"
DATA_PATH = Path("data/outlines.jsonl")
OUTPUT_DIR = "./flan-t5-study-outline-generator"
MAX_INPUT_LENGTH = 512
MAX_TARGET_LENGTH = 512
BATCH_SIZE = 2  # Keep batch size small for T4 VRAM with flan-t5-large
GRAD_ACCUM_STEPS = 4  # Effective batch size = 8
EPOCHS = 3
LEARNING_RATE = 5e-5


def load_jsonl(path: Path) -> list[dict]:
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def preprocess(examples, tokenizer):
    inputs = []
    for topic, m_count, fmt in zip(examples["topic"], examples["module_count"], examples["format"]):
        prompt = (
            f"You are an educational AI writing a course outline.\n"
            f"Generate a course outline for the topic: {topic}\n"
            f"The course must have exactly {m_count} modules.\n"
            f"Format: {fmt}\n"
            f"Output a JSON object with keys: title, description, modules.\nJSON:"
        )
        inputs.append(prompt)

    model_inputs = tokenizer(
        inputs, max_length=MAX_INPUT_LENGTH, truncation=True, padding="max_length"
    )
    labels = tokenizer(
        text_target=examples["output"], max_length=MAX_TARGET_LENGTH, truncation=True, padding="max_length"
    )

    model_inputs["labels"] = labels["input_ids"]
    return model_inputs


def compute_metrics(eval_pred, tokenizer, rouge):
    predictions, labels = eval_pred
    decoded_preds = tokenizer.batch_decode(predictions, skip_special_tokens=True)
    labels = [[l for l in label if l != -100] for label in labels]
    decoded_labels = tokenizer.batch_decode(labels, skip_special_tokens=True)

    result = rouge.compute(predictions=decoded_preds, references=decoded_labels, use_stemmer=True)

    # Calculate percentage of predictions that parse as valid JSON
    valid_json_count = 0
    for pred in decoded_preds:
        try:
            json.loads(pred)
            valid_json_count += 1
        except Exception:
            pass

    metrics = {k: round(v * 100, 4) for k, v in result.items()}
    metrics["valid_json_pct"] = round((valid_json_count / len(decoded_preds)) * 100, 2) if decoded_preds else 0.0
    return metrics


def main():
    print(f"Loading base model: {BASE_MODEL}")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    model = AutoModelForSeq2SeqLM.from_pretrained(BASE_MODEL)

    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Training data file {DATA_PATH} not found. Run prepare_outline_data.py --generate-synthetic first.")

    records = load_jsonl(DATA_PATH)
    print(f"Loaded {len(records)} training examples.")

    split = int(len(records) * 0.9)
    train_ds = Dataset.from_list(records[:split]).map(
        lambda ex: preprocess(ex, tokenizer), batched=True, remove_columns=["topic", "module_count", "format", "output"]
    )
    eval_ds = Dataset.from_list(records[split:]).map(
        lambda ex: preprocess(ex, tokenizer), batched=True, remove_columns=["topic", "module_count", "format", "output"]
    )

    rouge = evaluate.load("rouge")
    data_collator = DataCollatorForSeq2Seq(tokenizer, model=model, pad_to_multiple_of=8)

    training_args = Seq2SeqTrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=GRAD_ACCUM_STEPS,
        learning_rate=LEARNING_RATE,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        predict_with_generate=True,
        fp16=True,  # Enable FP16 GPU mixed precision on Colab T4
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

    print("Starting outline generator fine-tuning...")
    trainer.train()

    print(f"Saving fine-tuned model to {OUTPUT_DIR}")
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print("Done! Model saved. Upload to HuggingFace Hub for deployment.")


if __name__ == "__main__":
    main()
