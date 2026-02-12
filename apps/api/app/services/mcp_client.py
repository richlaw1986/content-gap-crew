"""MCP (Model Context Protocol) client for connecting to external tool servers.

Reads MCP server configurations from Sanity and wraps each MCP tool as
a CrewAI-compatible @tool function so agents can call them natively.

Supports three transports:
- stdio: launches a subprocess (e.g. `npx @sanity/mcp-server`)
- http:  connects via HTTP+SSE (streamable HTTP transport)
- websocket: reserved for future use

Environment variables for MCP servers can reference Sanity credential
documents — e.g. the server needs SANITY_API_TOKEN and the env entry
points to a credential doc.  We resolve those at startup.
"""

import asyncio
import json
import logging
import os
from typing import Any

from crewai.tools import tool as crewai_tool

logger = logging.getLogger(__name__)


# ── Environment resolution ─────────────────────────────────────

def _resolve_mcp_env(env_entries: list[dict[str, Any]] | None) -> dict[str, str]:
    """Resolve an MCP server's env[] array into a flat dict.

    Each entry has:
      - key: env var name
      - value: literal value (optional)
      - fromCredential: { _id, type, storageMethod, ... } (optional)

    If fromCredential is set, we pull the appropriate field from the
    credential document based on its type.
    """
    if not env_entries:
        return {}

    result: dict[str, str] = {}
    _cred_field_map = {
        "openai": "openaiApiKey",
        "anthropic": "anthropicApiKey",
        "brave": "braveApiKey",
        "serpapi": "serpApiKey",
        "semrush": "semrushApiKey",
        "google_api": "googleApiKey",
        "hunter": "hunterApiKey",
        "clearbit": "clearbitApiKey",
        "github": "githubPersonalAccessToken",
        "sanity": "sanityApiToken",
        "slack": "slackWebhookUrl",
    }

    for entry in env_entries:
        key = entry.get("key", "")
        if not key:
            continue

        # Direct value
        value = entry.get("value")
        if value:
            result[key] = value
            continue

        # From credential reference
        cred = entry.get("fromCredential")
        if not cred or not isinstance(cred, dict):
            continue

        cred_type = cred.get("type", "")
        storage = cred.get("storageMethod", "env")
        field = _cred_field_map.get(cred_type)
        if not field:
            # Fallback: try first non-meta field
            for k, v in cred.items():
                if k.startswith("_") or k in ("type", "storageMethod", "name"):
                    continue
                if v:
                    field = k
                    break

        raw = cred.get(field, "") if field else ""
        if not raw:
            logger.warning(f"MCP env {key}: no value found in credential {cred.get('_id')}")
            continue

        if storage == "env":
            resolved = os.environ.get(raw, "")
            if not resolved:
                logger.warning(f"MCP env {key}: env var '{raw}' not set")
            result[key] = resolved
        else:
            result[key] = raw

    return result


# ── MCP tool wrappers ──────────────────────────────────────────

def _make_mcp_tool(server_name: str, tool_name: str, tool_desc: str, call_fn):
    """Create a CrewAI-compatible tool function wrapping an MCP tool call."""

    # We use `crewai_tool` decorator programmatically
    @crewai_tool
    def mcp_tool_wrapper(input_json: str = "{}") -> str:
        """Call an MCP tool with JSON-encoded arguments.

        Args:
            input_json: JSON string of arguments to pass to the tool.

        Returns:
            Tool result as a string.
        """
        try:
            args = json.loads(input_json) if input_json else {}
        except json.JSONDecodeError:
            args = {"query": input_json}

        try:
            result = call_fn(tool_name, args)
            if isinstance(result, dict):
                return json.dumps(result, indent=2)
            return str(result)
        except Exception as exc:
            return f"MCP tool error ({server_name}/{tool_name}): {exc}"

    # Override the name and description to match the MCP tool
    mcp_tool_wrapper.name = f"mcp_{server_name}_{tool_name}"
    mcp_tool_wrapper.description = (
        f"[MCP: {server_name}] {tool_desc or tool_name}\n"
        f"Pass arguments as a JSON string."
    )
    return mcp_tool_wrapper


# ── Stdio transport ────────────────────────────────────────────

class StdioMCPConnection:
    """Manages a stdio MCP server subprocess and communicates via JSON-RPC."""

    def __init__(self, command: str, args: list[str], env: dict[str, str],
                 timeout_ms: int = 30000):
        self.command = command
        self.args = args
        self.env = {**os.environ, **env}  # merge with current env
        self.timeout = timeout_ms / 1000.0
        self.process: asyncio.subprocess.Process | None = None
        self._request_id = 0
        self._tools: list[dict[str, Any]] = []

    async def connect(self) -> None:
        """Start the MCP server subprocess."""
        try:
            self.process = await asyncio.create_subprocess_exec(
                self.command, *self.args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=self.env,
            )
            # Send initialize request
            await self._send_request("initialize", {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "content-gap-crew", "version": "1.0"},
            })
            # List available tools
            result = await self._send_request("tools/list", {})
            self._tools = result.get("tools", []) if result else []
            logger.info(f"MCP stdio: connected, {len(self._tools)} tools available")
        except Exception as exc:
            logger.warning(f"MCP stdio connection failed: {exc}")
            self._tools = []

    async def disconnect(self) -> None:
        if self.process and self.process.returncode is None:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self.process.kill()

    async def _send_request(self, method: str, params: dict) -> dict | None:
        """Send a JSON-RPC request and wait for the response."""
        if not self.process or not self.process.stdin or not self.process.stdout:
            return None

        self._request_id += 1
        request = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params,
        }
        line = json.dumps(request) + "\n"
        self.process.stdin.write(line.encode())
        await self.process.stdin.drain()

        try:
            raw = await asyncio.wait_for(
                self.process.stdout.readline(), timeout=self.timeout
            )
            if not raw:
                return None
            response = json.loads(raw.decode().strip())
            if "error" in response:
                logger.warning(f"MCP error ({method}): {response['error']}")
                return None
            return response.get("result")
        except asyncio.TimeoutError:
            logger.warning(f"MCP timeout waiting for {method}")
            return None
        except json.JSONDecodeError as exc:
            logger.warning(f"MCP invalid JSON response: {exc}")
            return None

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        """Call a tool on the MCP server."""
        result = await self._send_request("tools/call", {
            "name": tool_name,
            "arguments": arguments,
        })
        if result and "content" in result:
            # MCP returns content as a list of content blocks
            parts = []
            for block in result["content"]:
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif block.get("type") == "resource":
                    parts.append(json.dumps(block.get("resource", {})))
            return "\n".join(parts)
        return result

    @property
    def tools(self) -> list[dict[str, Any]]:
        return self._tools


# ── HTTP/SSE transport ─────────────────────────────────────────

class HttpMCPConnection:
    """Connects to an MCP server over HTTP (Streamable HTTP transport)."""

    def __init__(self, url: str, env: dict[str, str], timeout_ms: int = 30000):
        self.url = url.rstrip("/")
        self.env = env
        self.timeout = timeout_ms / 1000.0
        self._tools: list[dict[str, Any]] = []
        self._session_url: str | None = None

    async def connect(self) -> None:
        """Initialize session with the HTTP MCP server."""
        import httpx

        headers = {"Content-Type": "application/json"}
        # Pass any env as bearer token if AUTHORIZATION_TOKEN is present
        auth_token = self.env.get("AUTHORIZATION_TOKEN") or self.env.get("API_KEY")
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Initialize
                init_resp = await client.post(f"{self.url}", json={
                    "jsonrpc": "2.0", "id": 1, "method": "initialize",
                    "params": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {},
                        "clientInfo": {"name": "content-gap-crew", "version": "1.0"},
                    },
                }, headers=headers)
                init_resp.raise_for_status()

                # List tools
                tools_resp = await client.post(f"{self.url}", json={
                    "jsonrpc": "2.0", "id": 2, "method": "tools/list",
                    "params": {},
                }, headers=headers)
                tools_resp.raise_for_status()
                result = tools_resp.json().get("result", {})
                self._tools = result.get("tools", [])
                logger.info(f"MCP HTTP: connected to {self.url}, {len(self._tools)} tools")
        except Exception as exc:
            logger.warning(f"MCP HTTP connection to {self.url} failed: {exc}")
            self._tools = []

    async def disconnect(self) -> None:
        pass  # HTTP is stateless, nothing to close

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        """Call a tool on the HTTP MCP server."""
        import httpx

        headers = {"Content-Type": "application/json"}
        auth_token = self.env.get("AUTHORIZATION_TOKEN") or self.env.get("API_KEY")
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(f"{self.url}", json={
                    "jsonrpc": "2.0", "id": 3, "method": "tools/call",
                    "params": {"name": tool_name, "arguments": arguments},
                }, headers=headers)
                resp.raise_for_status()
                result = resp.json().get("result", {})

                if "content" in result:
                    parts = []
                    for block in result["content"]:
                        if block.get("type") == "text":
                            parts.append(block.get("text", ""))
                        elif block.get("type") == "resource":
                            parts.append(json.dumps(block.get("resource", {})))
                    return "\n".join(parts)
                return result
        except Exception as exc:
            return f"MCP HTTP tool call error: {exc}"

    @property
    def tools(self) -> list[dict[str, Any]]:
        return self._tools


# ── Public API ─────────────────────────────────────────────────

class MCPManager:
    """Manages MCP server connections and exposes their tools as CrewAI tools.

    Usage:
        manager = MCPManager()
        await manager.connect_servers(server_configs)
        tools = manager.get_all_tools()  # list of CrewAI tool functions
        # ... use tools in agent building ...
        await manager.disconnect_all()
    """

    def __init__(self):
        self._connections: dict[str, StdioMCPConnection | HttpMCPConnection] = {}

    async def connect_servers(self, server_configs: list[dict[str, Any]]) -> None:
        """Connect to all configured MCP servers."""
        for config in server_configs:
            name = config.get("name", "unknown")
            transport = config.get("transport", "stdio")
            env = _resolve_mcp_env(config.get("env"))
            timeout = config.get("timeout", 30000)

            try:
                if transport == "stdio":
                    command = config.get("command")
                    args = config.get("args", [])
                    if not command:
                        logger.warning(f"MCP server '{name}': no command configured")
                        continue
                    conn = StdioMCPConnection(command, args, env, timeout)
                    await conn.connect()
                    self._connections[name] = conn

                elif transport == "http":
                    url = config.get("url")
                    if not url:
                        logger.warning(f"MCP server '{name}': no URL configured")
                        continue
                    conn = HttpMCPConnection(url, env, timeout)
                    await conn.connect()
                    self._connections[name] = conn

                elif transport == "websocket":
                    logger.warning(f"MCP server '{name}': websocket transport not yet implemented")
                    continue

                else:
                    logger.warning(f"MCP server '{name}': unknown transport '{transport}'")

            except Exception as exc:
                logger.warning(f"Failed to connect MCP server '{name}': {exc}")

    async def disconnect_all(self) -> None:
        """Disconnect from all MCP servers."""
        for name, conn in self._connections.items():
            try:
                await conn.disconnect()
            except Exception as exc:
                logger.warning(f"Error disconnecting MCP server '{name}': {exc}")
        self._connections.clear()

    def get_all_tools(self) -> list:
        """Get all MCP tools wrapped as CrewAI-compatible tool functions.

        Returns a list of tool functions that can be added to any agent.
        """
        all_tools = []
        for server_name, conn in self._connections.items():
            for mcp_tool in conn.tools:
                tool_name = mcp_tool.get("name", "unknown")
                tool_desc = mcp_tool.get("description", "")

                # Create a synchronous wrapper that calls the async MCP tool
                def _make_sync_caller(c, tn):
                    def call_fn(name: str, args: dict) -> Any:
                        loop = asyncio.get_event_loop()
                        if loop.is_running():
                            # We're inside an async context — use a new thread
                            import concurrent.futures
                            with concurrent.futures.ThreadPoolExecutor() as pool:
                                future = pool.submit(asyncio.run, c.call_tool(name, args))
                                return future.result(timeout=60)
                        else:
                            return asyncio.run(c.call_tool(name, args))
                    return call_fn

                wrapper = _make_mcp_tool(
                    server_name=server_name,
                    tool_name=tool_name,
                    tool_desc=tool_desc,
                    call_fn=_make_sync_caller(conn, tool_name),
                )
                all_tools.append(wrapper)

        return all_tools

    def get_tools_for_server(self, server_name: str) -> list:
        """Get tools from a specific MCP server."""
        conn = self._connections.get(server_name)
        if not conn:
            return []

        tools = []
        for mcp_tool in conn.tools:
            tool_name = mcp_tool.get("name", "unknown")
            tool_desc = mcp_tool.get("description", "")

            def _make_sync_caller(c, tn):
                def call_fn(name: str, args: dict) -> Any:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        import concurrent.futures
                        with concurrent.futures.ThreadPoolExecutor() as pool:
                            future = pool.submit(asyncio.run, c.call_tool(name, args))
                            return future.result(timeout=60)
                    else:
                        return asyncio.run(c.call_tool(name, args))
                return call_fn

            wrapper = _make_mcp_tool(
                server_name=server_name,
                tool_name=tool_name,
                tool_desc=tool_desc,
                call_fn=_make_sync_caller(conn, tool_name),
            )
            tools.append(wrapper)

        return tools

    @property
    def connected_servers(self) -> list[str]:
        return list(self._connections.keys())

    @property
    def total_tools(self) -> int:
        return sum(len(c.tools) for c in self._connections.values())
