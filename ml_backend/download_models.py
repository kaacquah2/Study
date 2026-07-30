"""
Pre-download ML models at Docker build time so cold starts are fast.
Run via: RUN python download_models.py
"""

import os
from dotenv import load_dotenv

# Load .env variables if present
load_dotenv()

from sentence_transformers import SentenceTransformer
from transformers import AutoConfig, AutoTokenizer, AutoModelForSeq2SeqLM, AutoModelForCausalLM

# Get model IDs from environment, defaulting to standard configurations
summarizer_id = os.getenv("SUMMARIZER_MODEL_ID", "google/flan-t5-base")
paraphraser_id = os.getenv("PARAPHRASER_MODEL_ID", "google/flan-t5-base")
outline_id = os.getenv("OUTLINE_MODEL_ID", "google/flan-t5-large")
lesson_id = os.getenv("LESSON_MODEL_ID", "google/flan-t5-large")
chat_id = os.getenv("CHAT_MODEL_ID", "TinyLlama/TinyLlama-1.1B-Chat-v1.0")
embed_id = os.getenv("EMBED_MODEL_ID", "sentence-transformers/all-MiniLM-L6-v2")

qg_id = os.getenv("QUIZ_QG_MODEL_ID", "valhalla/t5-small-qg-prepend")
dg_id = os.getenv("QUIZ_DG_MODEL_ID", "potsawee/t5-large-generation-race-Distractor")

print(f"Downloading embedding model ({embed_id})...")
SentenceTransformer(embed_id)

# Helper function to cache Seq2Seq models
def cache_seq2seq(model_id: str, name: str):
    print(f"Downloading {name} model ({model_id})...")
    AutoTokenizer.from_pretrained(model_id)
    AutoModelForSeq2SeqLM.from_pretrained(model_id)

# Helper function to cache CausalLM models
def cache_causallm(model_id: str, name: str):
    print(f"Downloading {name} model ({model_id})...")
    AutoTokenizer.from_pretrained(model_id)
    AutoModelForCausalLM.from_pretrained(model_id)

def cache_chat_model(model_id: str, name: str):
    print(f"Downloading {name} model ({model_id})...")
    try:
        config = AutoConfig.from_pretrained(model_id)
        if getattr(config, "is_encoder_decoder", False):
            cache_seq2seq(model_id, name)
        else:
            cache_causallm(model_id, name)
    except Exception as e:
        print(f"Could not inspect config for {model_id}: {e}. Falling back to default CausalLM caching.")
        cache_causallm(model_id, name)

# Cache Seq2Seq models
cache_seq2seq(summarizer_id, "summarizer")

if paraphraser_id != summarizer_id:
    cache_seq2seq(paraphraser_id, "paraphraser")

cache_seq2seq(outline_id, "outline generator")

if lesson_id != outline_id:
    cache_seq2seq(lesson_id, "lesson generator")

# Cache Chat model dynamically based on architecture config
cache_chat_model(chat_id, "chat assistant")

# Cache Quiz pipeline models
cache_seq2seq(qg_id, "quiz QG")
cache_seq2seq(dg_id, "quiz DG")

print("All models successfully pre-cached.")

