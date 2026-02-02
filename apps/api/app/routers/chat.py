"""
Chat endpoint for brief discussion before running a crew.

This allows users to discuss their content gap analysis needs
with an AI assistant before starting a full crew run.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.models import ChatMessage, ChatRequest, ChatResponse, RunInputs
from app.services.sanity import SanityClient, get_sanity_client

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    sanity: SanityClient = Depends(get_sanity_client),
) -> ChatResponse:
    """
    Chat with an AI assistant to discuss content gap analysis needs.
    
    The assistant can help:
    - Clarify the topic and focus areas
    - Suggest relevant focus areas based on the topic
    - Explain what the crew will analyze
    - Recommend which crew configuration to use
    
    Returns a response message and optionally suggested run inputs.
    """
    settings = get_settings()
    
    # TODO: Implement actual LLM chat
    # For now, return a placeholder response
    
    # Get the last user message
    user_messages = [m for m in request.messages if m.role == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="No user message provided")
    
    last_message = user_messages[-1].content.lower()
    
    # Simple keyword-based response (placeholder)
    if "ai" in last_message or "llm" in last_message:
        response_content = (
            "Great! AI and LLM integration is a hot topic. I'd suggest focusing on:\n\n"
            "- AI content generation with CMS\n"
            "- LLM integration patterns\n"
            "- RAG (retrieval-augmented generation) architectures\n"
            "- AI-powered content workflows\n\n"
            "Would you like me to set up a content gap analysis with these focus areas?"
        )
        suggested = RunInputs(
            topic="AI and content management",
            focus_areas=[
                "AI content generation CMS",
                "LLM integration headless CMS",
                "RAG retrieval augmented generation CMS",
                "AI-powered content workflows",
            ],
        )
    elif "seo" in last_message or "search" in last_message:
        response_content = (
            "SEO and search optimization is crucial. Key areas to analyze:\n\n"
            "- Top X lists (high AEO value)\n"
            "- Definitional content\n"
            "- Comparison pages\n"
            "- Technical SEO guides\n\n"
            "Should I configure the analysis for SEO-focused content gaps?"
        )
        suggested = RunInputs(
            topic="SEO and search optimization",
            focus_areas=[
                "top headless CMS platforms",
                "best CMS for developers",
                "what is structured content",
                "headless CMS comparison",
            ],
        )
    elif "competitor" in last_message:
        response_content = (
            "Competitor analysis is a great approach. I'll focus on:\n\n"
            "- Content that competitors have but Sanity doesn't\n"
            "- Topics where competitors rank well\n"
            "- Gaps in comparison content\n\n"
            "Ready to start the competitor-focused analysis?"
        )
        suggested = RunInputs(
            topic="Competitor content analysis",
            focus_areas=[
                "contentful vs sanity",
                "strapi vs sanity",
                "headless CMS comparison",
                "enterprise CMS features",
            ],
        )
    else:
        response_content = (
            "I can help you identify content gaps for Sanity.io. "
            "What area would you like to focus on?\n\n"
            "Popular options:\n"
            "- **AI/LLM integration** - How AI works with content management\n"
            "- **SEO/AEO** - Search and answer engine optimization\n"
            "- **Competitor analysis** - What competitors cover that we don't\n"
            "- **Developer experience** - Technical content and tutorials\n\n"
            "Just tell me what you're interested in!"
        )
        suggested = None
    
    return ChatResponse(
        message=ChatMessage(role="assistant", content=response_content),
        suggestedInputs=suggested,
    )
