/**
 * OpenAI-powered query generation tool.
 * Port of apps/api/app/tools/openai_tools.py
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

function localQueryFanout(query: string): string {
  const patterns: Record<string, string[]> = {
    questions: [
      `What is ${query}?`,
      `How does ${query} work in a headless CMS?`,
      `Why use ${query} for content management?`,
      `When should I use ${query}?`,
      `What are the benefits of ${query}?`,
    ],
    comparisons: [
      `${query} vs Contentful`,
      `${query} vs Strapi`,
      `Sanity ${query} vs WordPress`,
      `Best ${query} solution for enterprise`,
    ],
    howTo: [
      `How to implement ${query} in Sanity`,
      `How to set up ${query} with Next.js`,
      `How to configure ${query} for headless CMS`,
      `How to migrate ${query} to Sanity`,
    ],
    ai: [
      `How to use AI with ${query}`,
      `AI-powered ${query} for CMS`,
      `LLM integration with ${query}`,
      `Automating ${query} with AI`,
      `ChatGPT for ${query} in content management`,
    ],
    topX: [
      `Top 10 ${query} tools`,
      `Best ${query} practices 2025`,
      `Top ${query} solutions for enterprise`,
      `Best ${query} examples`,
      `Leading ${query} platforms compared`,
    ],
  };

  let result = `
LLM QUERY FANOUT (Local Generation)
===================================
Base topic: "${query}"

Likely Questions:
`;
  for (const q of patterns.questions) result += `  - ${q}\n`;
  result += "\nComparison Queries:\n";
  for (const q of patterns.comparisons) result += `  - ${q}\n`;
  result += "\nHow-To Queries:\n";
  for (const q of patterns.howTo) result += `  - ${q}\n`;
  result += "\nAI-Related Queries (KEY FOCUS):\n";
  for (const q of patterns.ai) result += `  - ${q}\n`;
  result += "\nTop X / Best Lists (AEO Important):\n";
  for (const q of patterns.topX) result += `  - ${q}\n`;

  return result;
}

export const openaiQueryFanout = createTool({
  id: "openai_query_fanout",
  description:
    "Generate query variations using OpenAI, with special focus on AI + CMS topics. " +
    "Falls back to local pattern generation if OpenAI is unavailable.",
  inputSchema: z.object({
    query: z.string().describe("Base topic/keyword to expand"),
    useOpenAI: z
      .boolean()
      .default(true)
      .describe("Whether to use OpenAI (false = local fallback)"),
  }),
  execute: async ({ context: { query, useOpenAI } }) => {
    if (!useOpenAI || !process.env.OPENAI_API_KEY) {
      return localQueryFanout(query);
    }

    try {
      const { text } = await generateText({
        model: openai("gpt-4o"),
        temperature: 0.7,
        maxTokens: 1200,
        prompt: `Given the topic/keyword "${query}" in the context of content management systems, AI, and web development, generate:

1. 10 likely questions a developer or marketer might ask an AI assistant about this topic
2. 5 comparison queries (e.g., "X vs Y")
3. 5 "how to" queries
4. 5 AI-specific queries (how AI/LLMs relate to this topic)
5. 5 "best" or "top X" queries (important for AEO/featured snippets)

Focus on queries that would be relevant to someone:
- Evaluating or using a headless CMS
- Exploring AI integration with content management
- Making enterprise content decisions

Format each query on its own line, grouped by category.`,
      });

      return `
LLM QUERY FANOUT
================
Base topic: "${query}"

${text}
`;
    } catch (e: any) {
      return localQueryFanout(query) + `\n\n(OpenAI unavailable: ${e.message})`;
    }
  },
});
