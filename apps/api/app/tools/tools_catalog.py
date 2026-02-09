"""Tool catalog helpers for agents."""

from typing import Any

from crewai_tools import tool

from app.services.sanity import get_sanity_client
from app.tools import TOOL_REGISTRY


@tool
def list_available_tools(include_mcp: bool = True) -> str:
    """List available tools, including MCP-provided tools when enabled."""
    import asyncio
    import json

    local_tools = []
    for name, tool_fn in TOOL_REGISTRY.items():
        if name == "list_available_tools":
            continue
        description = (tool_fn.__doc__ or "").strip()
        local_tools.append(
            {
                "name": name,
                "description": description,
                "source": "builtin",
            }
        )

    async def _fetch_mcp() -> list[dict[str, Any]]:
        sanity = get_sanity_client()
        try:
            return await sanity.list_mcp_servers()
        finally:
            await sanity.close()

    mcp_servers = asyncio.run(_fetch_mcp()) if include_mcp else []
    mcp_tools: list[dict[str, Any]] = []
    for server in mcp_servers:
        for tool_name in server.get("tools", []) or []:
            mcp_tools.append(
                {
                    "name": tool_name,
                    "description": server.get("description", ""),
                    "source": "mcp",
                    "server": server.get("displayName") or server.get("name"),
                }
            )

    return json.dumps(
        {
            "tools": local_tools + mcp_tools,
            "mcpServers": mcp_servers if include_mcp else [],
        },
        indent=2,
    )
