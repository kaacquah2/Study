"""
Fine-tuning script: flan-t5-base for academic paraphrasing.

Run on Google Colab (Free T4 GPU) — takes ~1-2 hours.

Training data format (paraphrasing.jsonl):
  {"input": "Original sentence here.", "output": "Paraphrased version here.", "style": "academic"}

Evaluation metric: BLEU score (higher is better; target ≥ 5% improvement over base zero-shot).

After training:
  1. Save to ./flan-t5-study-paraphraser/
  2. Upload to HuggingFace Hub
  3. Set PARAPHRASER_MODEL_ID=YOUR_USERNAME/flan-t5-study-paraphraser in .env
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
BASE_MODEL = "google/flan-t5-base"
DATA_PATH = Path("data/paraphrasing.jsonl")
OUTPUT_DIR = "./flan-t5-study-paraphraser"
MAX_INPUT_LENGTH = 256
MAX_TARGET_LENGTH = 256
BATCH_SIZE = 8
EPOCHS = 3
LEARNING_RATE = 5e-5

_STYLE_PROMPTS = {
    "academic": "Paraphrase the following sentence in a formal academic style:",
    "simple": "Rewrite the following sentence in simpler, easy-to-understand language:",
    "formal": "Rephrase the following text in a professional and formal tone:",
}


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
    for text, style in zip(examples["input"], examples.get("style", ["academic"] * len(examples["input"]))):
        prefix = _STYLE_PROMPTS.get(style, _STYLE_PROMPTS["academic"])
        inputs.append(f"{prefix}\n\n{text}")

    model_inputs = tokenizer(
        inputs, max_length=MAX_INPUT_LENGTH, truncation=True, padding="max_length"
    )
    labels = tokenizer(
        text_target=examples["output"], max_length=MAX_TARGET_LENGTH, truncation=True, padding="max_length"
    )

    model_inputs["labels"] = labels["input_ids"]
    return model_inputs


def compute_metrics(eval_pred, tokenizer, bleu):
    predictions, labels = eval_pred
    decoded_preds = tokenizer.batch_decode(predictions, skip_special_tokens=True)
    labels = [[l for l in label if l != -100] for label in labels]
    decoded_labels = tokenizer.batch_decode(labels, skip_special_tokens=True)

    result = bleu.compute(predictions=decoded_preds, references=[[r] for r in decoded_labels])
    return {"bleu": round(result["bleu"] * 100, 4)}


def main():
    print(f"Loading base model: {BASE_MODEL}")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    model = AutoModelForSeq2SeqLM.from_pretrained(BASE_MODEL)

    records = load_jsonl(DATA_PATH)
    print(f"Loaded {len(records)} training examples.")

    # Handle missing 'style' key gracefully
    for r in records:
        r.setdefault("style", "academic")

    split = int(len(records) * 0.9)
    train_ds = Dataset.from_list(records[:split]).map(
        lambda ex: preprocess(ex, tokenizer), batched=True, remove_columns=["input", "output", "style"]
    )
    eval_ds = Dataset.from_list(records[split:]).map(
        lambda ex: preprocess(ex, tokenizer), batched=True, remove_columns=["input", "output", "style"]
    )

    bleu = evaluate.load("bleu")
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
        fp16=True,
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
        compute_metrics=lambda ep: compute_metrics(ep, tokenizer, bleu),
    )

    print("Starting fine-tuning...")
    trainer.train()
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"Done! Model saved to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
