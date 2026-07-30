"""
PDF Converter & RAG Indexer tool.

Converts all PDF files from a specified folder into plain text (.txt) files,
and optionally builds/updates the FAISS RAG vector store index automatically.

Usage:
  python convert_pdfs.py --pdf-dir path/to/your/pdf_folder

Optional arguments:
  --out-dir path/to/output_txt_folder (default: vector_store/sample_docs)
  --index                              (build FAISS vector store after converting)
  --clear-index                        (clear existing FAISS index before rebuilding)
"""

import argparse
import logging
from pathlib import Path
import sys

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

try:
    from pypdf import PdfReader
except ImportError:
    logger.error("pypdf is required to process PDF files. Installing pypdf...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pypdf"])
    from pypdf import PdfReader

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).parent))


def convert_pdf(pdf_path: Path, output_txt_path: Path) -> bool:
    """Extract text from a PDF file and save as UTF-8 .txt file."""
    try:
        reader = PdfReader(str(pdf_path))
        extracted_pages = []
        for idx, page in enumerate(reader.pages, 1):
            text = page.extract_text()
            if text and text.strip():
                extracted_pages.append(text.strip())

        if not extracted_pages:
            logger.warning(f"No readable text found in {pdf_path.name} (it might be a scanned image-only PDF).")
            return False

        full_text = f"--- Document: {pdf_path.name} ---\n\n" + "\n\n".join(extracted_pages)
        output_txt_path.parent.mkdir(parents=True, exist_ok=True)
        output_txt_path.write_text(full_text, encoding="utf-8")
        logger.info(f"✓ Converted: {pdf_path.name} -> {output_txt_path.name} ({len(full_text)} chars)")
        return True
    except Exception as e:
        logger.error(f"Failed to process {pdf_path.name}: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Convert PDF lecture notes and past questions to TXT & Index for RAG.")
    parser.add_argument("--pdf-dir", required=True, type=Path, help="Directory containing PDF files.")
    parser.add_argument("--out-dir", type=Path, default=Path(__file__).parent / "vector_store" / "sample_docs", help="Output directory for extracted .txt files.")
    parser.add_argument("--index", action="store_true", default=True, help="Build FAISS vector store index after conversion.")
    parser.add_argument("--clear-index", action="store_true", help="Clear existing FAISS index before adding new documents.")

    args = parser.parse_args()

    if not args.pdf_dir.is_dir():
        logger.error(f"Directory not found: {args.pdf_dir}")
        sys.exit(1)

    pdf_files = list(args.pdf_dir.rglob("*.pdf"))
    if not pdf_files:
        logger.error(f"No .pdf files found in {args.pdf_dir}")
        sys.exit(1)

    logger.info(f"Found {len(pdf_files)} PDF file(s) in {args.pdf_dir}")

    converted_count = 0
    for pdf_path in pdf_files:
        rel_path = pdf_path.relative_to(args.pdf_dir)
        output_txt_path = args.out_dir / rel_path.with_suffix(".txt")
        if convert_pdf(pdf_path, output_txt_path):
            converted_count += 1

    logger.info(f"Finished converting {converted_count}/{len(pdf_files)} PDF(s). Output folder: {args.out_dir}")

    if args.index and converted_count > 0:
        logger.info("Building FAISS Vector Store Index...")
        from vector_store.build_index import main as build_index_main
        # Run indexer
        sys.argv = ["build_index.py", "--docs-dir", str(args.out_dir)]
        if args.clear_index:
            sys.argv.append("--clear")
        build_index_main()


if __name__ == "__main__":
    main()
