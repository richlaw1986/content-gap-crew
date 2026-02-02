"""Reddit discussion lookup tool."""

import re
import time
from datetime import datetime
from typing import Any

from crewai.tools import tool

from app.tools.base import CredentialError, resolve_credential_value


def get_reddit_client(credential: dict[str, Any]):
    """Get a Reddit client with credentials.
    
    Args:
        credential: Credential document with type='reddit'
        
    Returns:
        PRAW Reddit instance
        
    Raises:
        CredentialError: If credentials are missing or invalid
    """
    try:
        import praw
    except ImportError:
        raise CredentialError("praw package not installed. Run: pip install praw")
    
    client_id = resolve_credential_value(credential, "redditClientId")
    client_secret = resolve_credential_value(credential, "redditClientSecret")
    user_agent = credential.get("redditUserAgent", "SanityContentGapBot/1.0")
    
    # If user_agent is an env var reference, resolve it
    if credential.get("storageMethod") == "env" and user_agent:
        import os
        user_agent = os.environ.get(user_agent, user_agent)
    
    return praw.Reddit(
        client_id=client_id,
        client_secret=client_secret,
        user_agent=user_agent,
    )


# Subreddits relevant to CMS, web dev, and AI
RELEVANT_SUBREDDITS = [
    "webdev", "programming", "technology", "learnprogramming",
    "Wordpress", "frontend", "backend", "smallbusiness",
    "Entrepreneur", "content_marketing", "SEO", "Marketing",
    "FullStack", "nocode", "sideproject", "javascript",
    "reactjs", "nextjs", "jamstack", "headlessCMS", "cms",
    "MachineLearning", "artificial", "ChatGPT", "LocalLLaMA",
]


@tool
def reddit_discussion_lookup(query: str, credential: dict[str, Any]) -> str:
    """
    Find relevant Reddit discussions and unanswered questions about the topic.
    Returns threads and comments from relevant subreddits.
    
    Args:
        query: Topic to search for
        credential: Reddit API credential document
        
    Returns:
        Analysis of Reddit discussions including top posts and common questions
        
    Raises:
        CredentialError: If Reddit credentials are missing or invalid
    """
    reddit = get_reddit_client(credential)
    
    all_posts = []
    all_comments = []
    pattern = rf"\b{re.escape(query)}\b"
    
    # Search relevant subreddits
    for subreddit_name in RELEVANT_SUBREDDITS:
        try:
            subreddit = reddit.subreddit(subreddit_name)
            
            for submission in subreddit.search(query, limit=10):
                # Check if post is relevant
                if (re.search(pattern, submission.title, re.IGNORECASE) or
                    query.lower() in submission.title.lower() or
                    "cms" in submission.title.lower() or
                    "sanity" in submission.title.lower() or
                    "headless" in submission.title.lower() or
                    "ai" in submission.title.lower()):
                    
                    post_data = {
                        "title": submission.title,
                        "subreddit": subreddit_name,
                        "score": submission.score,
                        "num_comments": submission.num_comments,
                        "url": submission.url,
                        "permalink": f"https://reddit.com{submission.permalink}",
                        "created": datetime.fromtimestamp(submission.created_utc).strftime("%Y-%m-%d"),
                        "selftext": submission.selftext[:500] if submission.selftext else "",
                    }
                    
                    # Avoid duplicates
                    if not any(p["permalink"] == post_data["permalink"] for p in all_posts):
                        all_posts.append(post_data)
                    
                    # Get top comments
                    try:
                        submission.comments.replace_more(limit=0)
                        for comment in submission.comments.list()[:5]:
                            if hasattr(comment, "body"):
                                all_comments.append({
                                    "thread_title": submission.title,
                                    "subreddit": subreddit_name,
                                    "comment": comment.body[:300],
                                    "score": comment.score,
                                })
                    except Exception:
                        pass
            
            # Rate limiting
            time.sleep(1)
            
        except Exception:
            continue
    
    # Also search r/all for AI + CMS mentions
    try:
        for submission in reddit.subreddit("all").search(f"cms ai content {query}", limit=15):
            post_data = {
                "title": submission.title,
                "subreddit": submission.subreddit.display_name,
                "score": submission.score,
                "num_comments": submission.num_comments,
                "url": submission.url,
                "permalink": f"https://reddit.com{submission.permalink}",
                "created": datetime.fromtimestamp(submission.created_utc).strftime("%Y-%m-%d"),
                "selftext": submission.selftext[:500] if submission.selftext else "",
            }
            
            if not any(p["permalink"] == post_data["permalink"] for p in all_posts):
                all_posts.append(post_data)
    except Exception:
        pass
    
    if not all_posts:
        return f"No Reddit discussions found for '{query}'"
    
    # Sort by engagement
    all_posts.sort(key=lambda x: x["score"] + x["num_comments"], reverse=True)
    
    result = f"""
REDDIT DISCUSSIONS
==================
Search query: "{query}"
Total relevant posts found: {len(all_posts)}
Total comments collected: {len(all_comments)}

Top Discussions by Engagement:
"""
    
    for post in all_posts[:15]:
        result += f"""
Title: {post['title']}
  Subreddit: r/{post['subreddit']}
  Score: {post['score']} | Comments: {post['num_comments']} | Date: {post['created']}
  URL: {post['permalink']}
"""
        if post["selftext"]:
            preview = post["selftext"][:200].replace("\n", " ")
            result += f"  Preview: {preview}...\n"
    
    # Extract questions
    questions = [p["title"] for p in all_posts if "?" in p["title"]]
    if questions:
        result += "\nCommon Questions Asked:\n"
        for q in questions[:10]:
            result += f"  - {q}\n"
    
    # Sample comments
    if all_comments:
        result += "\nSample Comments (potential content ideas):\n"
        all_comments.sort(key=lambda x: x["score"], reverse=True)
        for comment in all_comments[:10]:
            preview = comment["comment"][:150].replace("\n", " ")
            result += f"  - [r/{comment['subreddit']}] {preview}...\n"
    
    return result
