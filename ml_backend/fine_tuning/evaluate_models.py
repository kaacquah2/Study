"""
ML Models Evaluation & Benchmarking Harness.

Usage:
    cd ml_backend/fine_tuning
    python evaluate_models.py
"""

import sys
import logging
from pathlib import Path

# Add backend root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def evaluate_rag():
    """Benchmark RAG retrieval performance over the 48,472 chunk FAISS index."""
    logger.info("\n=== 1. Evaluating RAG Vector Store Retrieval ===")
    from models.rag_pipeline import rag

    test_queries = [
        ("Operating Systems process scheduling", ["process", "scheduling", "cpu", "operating"]),
        ("Compiler lexical analysis lexer tokens", ["token", "lexer", "lexical", "compiler"]),
        ("Expert Systems forward backward chaining", ["expert", "chaining", "inference", "rule"]),
        ("Calculus integration by parts tutorial", ["integration", "parts", "calculus", "integral"]),
        ("Graph Theory adjacency matrix vertices", ["graph", "matrix", "vertices", "edges"]),
    ]

    hits = 0
    total = len(test_queries)

    for query, expected_keywords in test_queries:
        context = rag.retrieve(query=query, top_k=3)
        context_lower = context.lower()
        matched = [kw for kw in expected_keywords if kw in context_lower]
        precision = len(matched) / len(expected_keywords) if expected_keywords else 0.0

        if precision >= 0.5:
            hits += 1
            logger.info(f"✓ QUERY: '{query}' -> HIT (Matched: {matched}, {len(context)} chars)")
        else:
            logger.warning(f"✗ QUERY: '{query}' -> LOW RELEVANCE (Matched: {matched})")

    hit_rate = (hits / total) * 100
    logger.info(f"RAG Retrieval Hit Rate: {hit_rate:.1f}% ({hits}/{total})\n")
    return hit_rate


def evaluate_summarizer():
    """Benchmark summarizer performance using ROUGE metric."""
    logger.info("=== 2. Evaluating Summarizer Model ===")
    try:
        import evaluate
        rouge = evaluate.load("rouge")
        from models.summarizer import summarize

        test_data = [
            (
                "Operating systems manage computer hardware and software resources. The operating system acts as an intermediary between users and computer hardware, handling task scheduling, memory management, and file system I/O.",
                "Operating systems manage hardware, software, task scheduling, and memory management."
            ),
            (
                "A compiler is a specialized computer program that translates computer code written in one programming language into another language, usually machine code, to create an executable program.",
                "Compilers translate source code into machine code to create executable programs."
            )
        ]

        preds = []
        refs = []
        for text, ref in test_data:
            summary = summarize(text)
            preds.append(summary)
            refs.append(ref)
            logger.info(f"Input: {text[:60]}...\n  Summary: {summary}\n")

        results = rouge.compute(predictions=preds, references=refs)
        logger.info(f"Summarizer ROUGE Results: {results}\n")
        return results
    except Exception as exc:
        logger.warning(f"Summarizer evaluation skipped or incomplete: {exc}\n")
        return {}


def evaluate_paraphraser():
    """Benchmark paraphraser performance using BLEU metric."""
    logger.info("=== 3. Evaluating Paraphraser Model ===")
    try:
        import evaluate
        bleu = evaluate.load("bleu")
        from models.paraphraser import paraphrase

        test_data = [
            ("A compiler translates high-level code into executable machine instructions.", "academic"),
            ("Operating systems manage CPU scheduling and RAM memory allocation.", "simple"),
            ("Artificial intelligence leverages algorithms to automate reasoning tasks.", "formal"),
        ]

        preds = []
        refs = []
        for text, style in test_data:
            rephrased = paraphrase(text, style=style)
            preds.append(rephrased)
            refs.append([text])
            logger.info(f"Style [{style.upper()}]: {text}\n  Rephrased: {rephrased}\n")

        results = bleu.compute(predictions=preds, references=refs)
        logger.info(f"Paraphraser BLEU Score: {results['bleu'] * 100:.2f}%\n")
        return results
    except Exception as exc:
        logger.warning(f"Paraphraser evaluation skipped or incomplete: {exc}\n")
        return {}


def main():
    logger.info("Starting ML Backend Models Evaluation Suite...")
    evaluate_rag()
    evaluate_summarizer()
    evaluate_paraphraser()
    logger.info("Evaluation Suite Completed Successfully.")


if __name__ == "__main__":
    main()
