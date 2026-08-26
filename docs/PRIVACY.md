# Privacy, Data Retention & Erasure Policy

This document details the data retention, vector embedding storage, and user-initiated data erasure workflows for the **Study AI** system.

---

## 1. Uploaded Materials & Document Lifecycle

When a student uploads course documents or notes (PDF, Markdown, plain text):

1. **Extraction & Chunking:** Text is extracted and partitioned into semantic chunks with provenance metadata (`sourceTitle`, `pageNumber`, `chapter`).
2. **Vector Indexing:** Dense embeddings are generated and inserted into the user's isolated FAISS partition (`user_id`).
3. **Storage Isolation:** Private student documents are strictly segregated from public/global course templates. Only requests bearing the user's verified Firebase Auth session token can query or retrieve these embeddings.

---

## 2. Right to Erasure & Deletion Workflows

Students possess full control over their study data:

### Deleting a Study Document (`DELETE /api/documents`)

When a document is deleted:

- The source file reference is removed.
- All associated text chunks are deleted from the vector store (`rag.clear(user_id)`).
- FAISS memory allocations for that document partition are invalidated.

### Deleting User Account & Complete History (`DELETE /api/user`)

Executing an account deletion (`src/lib/server/user/deleteUserData.ts`) initiates a cascade purge across Firestore:

- `users/{uid}` profile document
- `learningEvents/{uid}` event history subcollections
- `userLearningProfile/{uid}` aggregated analytics
- `mistakeRecords/{uid}` error bank entries
- `flashcards` where `uid == request.auth.uid`
- `courses` owned by `uid` and their associated module subcollections
- `usage/{uid}` rate limiting and token tracking buckets
- Vector store embeddings via `DELETE /documents`
