"""OpenAI-powered tools for query generation."""

from typing import Any

from crewai.tools import tool

from app.tools.base import CredentialError, resolve_credential_value


def get_openai_client(credential: dict[str, Any]):
    """Get an OpenAI client with credentials.
    
    Args:
        credential: Credential document with type='openai'
        
    Returns:
        OpenAI client instance
        
    Raises:
        CredentialError: If credentials are missing or invalid
    """
    try:
        import openai
    except ImportError:
        raise CredentialError("openai package not installed. Run: pip install openai")
    
    api_key = resolve_credential_value(credential, "openaiApiKey")
    return openai.OpenAI(api_key=api_key)


def generate_query_variations_local(query: str) -> str:
    """Fallback query variation generator without OpenAI."""
    patterns = {
        "questions": [
            f"What is {query}?",
            f"How does {query} work in a headless CMS?",
            f"Why use {query} for content management?",
            f"When should I use {query}?",
            f"What are the benefits of {query}?",
        ],
        "comparisons": [
            f"{query} vs Contentful",
            f"{query} vs Strapi",
            f"Sanity {query} vs WordPress",
            f"Best {query} solution for enterprise",
        ],
        "how_to": [
            f"How to implement {query} in Sanity",
            f"How to set up {query} with Next.js",
            f"How to configure {query} for headless CMS",
            f"How to migrate {query} to Sanity",
        ],
        "ai_queries": [
            f"How to use AI with {query}",
            f"AI-powered {query} for CMS",
            f"LLM integration with {query}",
            f"Automating {query} with AI",
            f"ChatGPT for {query} in content management",
        ],
        "top_x_lists": [
            f"Top 10 {query} tools",
            f"Best {query} practices 2025",
            f"Top {query} solutions for enterprise",
            f"Best {query} examples",
            f"Leading {query} platforms compared",
        ],
    }
    
    result = f"""
LLM QUERY FANOUT (Local Generation)
===================================
Base topic: "{query}"

Likely Questions:
"""
    for q in patterns["questions"]:
        result += f"  - {q}\n"
    
    result += "\nComparison Queries:\n"
    for q in patterns["comparisons"]:
        result += f"  - {q}\n"
    
    result += "\nHow-To Queries:\n"
    for q in patterns["how_to"]:
        result += f"  - {q}\n"
    
    result += "\nAI-Related Queries (KEY FOCUS):\n"
    for q in patterns["ai_queries"]:
        result += f"  - {q}\n"
    
    result += "\nTop X / Best Lists (AEO Important):\n"
    for q in patterns["top_x_lists"]:
        result += f"  - {q}\n"
    
    return result


@tool
def openai_query_fanout(query: str, credential: dict[str, Any] | None = None) -> str:
    """
    Generate query variations using OpenAI, with special focus on AI + CMS topics.
    
    If no credential is provided or OpenAI is unavailable, falls back to
    local pattern-based generation.
    
    Args:
        query: Base topic/keyword to expand
        credential: Optional OpenAI credential document
        
    Returns:
        List of query variations organized by category
    """
    if credential is None:
        return generate_query_variations_local(query)
    
    try:
        client = get_openai_client(credential)
        
        prompt = f"""Given the topic/keyword "{query}" in the context of content management systems, AI, and web development, generate:

1. 10 likely questions a developer or marketer might ask an AI assistant about this topic
2. 5 comparison queries (e.g., "X vs Y")
3. 5 "how to" queries
4. 5 AI-specific queries (how AI/LLMs relate to this topic)
5. 5 "best" or "top X" queries (important for AEO/featured snippets)

Focus on queries that would be relevant to someone:
- Evaluating or using a headless CMS
- Exploring AI integration with content management
- Making enterprise content decisions

Format each query on its own line, grouped by category."""

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1200,
            temperature=0.7,
        )
        
        return f"""
LLM QUERY FANOUT
================
Base topic: "{query}"

{response.choices[0].message.content}
"""
    
    except CredentialError:
        raise  # Re-raise credential errors (fail fast)
    except Exception as e:
        # For other errors, fall back to local generation
        return generate_query_variations_local(query) + f"\n\n(OpenAI unavailable: {str(e)})"
