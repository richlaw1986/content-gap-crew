"""Agent management endpoints."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.services.document_extractor import extract_from_sanity_asset

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("")
async def list_agents(request: Request) -> list[dict[str, Any]]:
    """List all agents."""
    sanity = request.app.state.sanity
    return await sanity.list_agents()


@router.get("/{agent_id}")
async def get_agent(agent_id: str, request: Request) -> dict[str, Any]:
    """Get an agent by ID with full details."""
    sanity = request.app.state.sanity
    agent = await sanity.get_agent(agent_id)

    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    return agent.model_dump(by_alias=True)


# ── Knowledge document extraction ─────────────────────────────


class ExtractionResult(BaseModel):
    """Result of extracting text from one knowledge document."""
    index: int
    title: str
    char_count: int
    preview: str  # first 200 chars


@router.post("/{agent_id}/extract-knowledge")
async def extract_knowledge(agent_id: str, request: Request) -> dict[str, Any]:
    """Extract text from all knowledge documents on an agent.

    Downloads each file from Sanity CDN, extracts text, and patches the
    agent document with the ``extractedSummary`` for each entry.

    Only processes documents that don't already have an extractedSummary
    (pass ``?force=true`` to re-extract all).
    """
    force = request.query_params.get("force", "").lower() in ("true", "1", "yes")
    sanity = request.app.state.sanity

    # Fetch the full agent document (raw dict, not Pydantic)
    agent_data = await sanity._query(
        """*[_type == "agent" && _id == $id][0] {
            _id,
            knowledgeDocuments[] {
                title, description, extractedSummary,
                "assetUrl": asset->url,
                "originalFilename": asset->originalFilename
            }
        }""",
        {"id": agent_id},
    )

    if not agent_data:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    docs = agent_data.get("knowledgeDocuments") or []
    if not docs:
        return {"message": "No knowledge documents to process", "extracted": []}

    results: list[dict[str, Any]] = []
    patches: list[dict[str, Any]] = []

    for i, doc in enumerate(docs):
        if not isinstance(doc, dict):
            continue
        title = doc.get("title") or f"Document {i}"
        existing = (doc.get("extractedSummary") or "").strip()

        if existing and not force:
            results.append({
                "index": i,
                "title": title,
                "skipped": True,
                "reason": "Already has extractedSummary (use ?force=true to re-extract)",
            })
            continue

        asset_url = doc.get("assetUrl")
        filename = doc.get("originalFilename") or "file.txt"
        if not asset_url:
            results.append({
                "index": i,
                "title": title,
                "skipped": True,
                "reason": "No file asset attached",
            })
            continue

        try:
            extracted = await extract_from_sanity_asset(asset_url, filename)
            results.append({
                "index": i,
                "title": title,
                "char_count": len(extracted),
                "preview": extracted[:200] + ("…" if len(extracted) > 200 else ""),
            })
            # Build a Sanity patch to set the extractedSummary at this array index
            patches.append({
                "patch": {
                    "id": agent_id,
                    "set": {
                        f"knowledgeDocuments[{i}].extractedSummary": extracted,
                    },
                }
            })
        except Exception as exc:
            logger.warning(f"Failed to extract {title} ({filename}): {exc}")
            results.append({
                "index": i,
                "title": title,
                "error": str(exc),
            })

    # Apply all patches in one mutation batch
    if patches:
        try:
            await sanity._mutate(patches)
            logger.info(
                f"Extracted and patched {len(patches)} knowledge document(s) "
                f"for agent {agent_id}"
            )
        except Exception as exc:
            logger.error(f"Failed to patch agent {agent_id}: {exc}")
            raise HTTPException(
                status_code=500,
                detail=f"Extraction succeeded but failed to save to Sanity: {exc}",
            )

    return {
        "message": f"Processed {len(docs)} document(s), extracted {len(patches)}",
        "extracted": results,
    }
