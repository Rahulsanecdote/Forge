import type { AnyForgeTool } from './types';
import { createSocialPosts } from './tools/create-social-posts';
import { draftReviewResponses } from './tools/draft-review-responses';
import { generateReport } from './tools/generate-report';
import { researchKeywords } from './tools/research-keywords';
import { analyzeCompetitors } from './tools/analyze-competitors';

// The agent's tool suite. Add a tool here and the agent can choose it.
export const tools: AnyForgeTool[] = [
  createSocialPosts,
  draftReviewResponses,
  generateReport,
  researchKeywords,
  analyzeCompetitors,
];

export const toolByName = new Map(tools.map((t) => [t.name, t] as const));
