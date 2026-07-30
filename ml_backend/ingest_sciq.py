"""
Ingest SciQ exam dataset (11,679 questions & explanations) into the FAISS vector store.

Usage:
    cd ml_backend
    python ingest_sciq.py
"""

import sys
import logging
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def main():
    logger.info("Loading SciQ dataset from HuggingFace...")
    from datasets import load_dataset
    from models.rag_pipeline import rag

    sciq = load_dataset("allenai/sciq")
    train_data = sciq["train"]

    logger.info(f"Formatting {len(train_data)} SciQ exam records...")
    texts = []
    for idx, sample in enumerate(train_data):
        q = sample.get("question", "").strip()
        ans = sample.get("correct_answer", "").strip()
        supp = sample.get("support", "").strip()
        d1 = sample.get("distractor1", "").strip()
        d2 = sample.get("distractor2", "").strip()
        d3 = sample.get("distractor3", "").strip()

        if not q or not ans:
            continue

        formatted_chunk = (
            f"--- Document: SciQ_Exam_Q{idx+1}.txt ---\n"
            f"Question: {q}\n"
            f"Correct Answer: {ans}\n"
            f"Explanation: {supp}\n"
            f"Options: {ans}, {d1}, {d2}, {d3}"
        )
        texts.append(formatted_chunk)

    logger.info(f"Adding {len(texts)} formatted SciQ chunks to FAISS vector store...")
    # Add in batches of 1,000 to keep memory optimized
    batch_size = 1000
    total_added = 0
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        added = rag.add_documents(batch, user_id="default_user")
        total_added += added
        logger.info(f"Indexed batch {i//batch_size + 1}/{(len(texts) + batch_size - 1)//batch_size}: {total_added} total chunks added.")

    logger.info(f"Done! Successfully indexed SciQ exam questions. FAISS index now contains {rag._index.ntotal} vectors.")


if __name__ == "__main__":
    main()
