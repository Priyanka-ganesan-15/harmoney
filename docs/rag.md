# RAG Plan

## Goal

Provide a household-scoped financial literacy assistant that can answer educational questions using approved finance documents and return citations for every grounded answer.

## Intended Flow

1. Upload or seed a document.
2. Parse content into raw text.
3. Split the text into chunks.
4. Generate embeddings.
5. Store chunk vectors and metadata in MongoDB-backed retrieval storage.
6. Retrieve the most relevant chunks for a query.
7. Generate an answer with citations and educational guardrails.

## Planned Constraints

- Household isolation for private uploads.
- Support for globally seeded financial literacy documents.
- No personalized investment recommendations.
- Answer formatting should make source citations visible.

## Expected Integration Points

- `src/lib/rag`: ingestion, provider abstraction, retrieval helpers
- `src/server/services`: advisor orchestration and safety handling
- `src/app/(dashboard)/dashboard/advisor`: user-facing assistant UI
