"""Tools for searching reusable skills from Sanity."""

from typing import Any

from crewai_tools import tool

from app.services.sanity import get_sanity_client


@tool
def search_skills(query: str = "", tags: list[str] | None = None, limit: int = 5) -> str:
    """Search skills by text and tags.

    Args:
        query: Free text query for name/description/tags.
        tags: Optional list of tags to filter.
        limit: Max number of skills to return.
    """
    import asyncio
    import json

    async def _run() -> list[dict[str, Any]]:
        sanity = get_sanity_client()
        try:
            return await sanity.search_skills(query=query or None, tags=tags, limit=limit)
        finally:
            await sanity.close()

    skills = asyncio.run(_run())
    if not skills:
        return "No skills found."

    return json.dumps(skills, indent=2)
