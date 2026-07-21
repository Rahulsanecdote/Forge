# Tools reference

Forge's capabilities are **tools** the agent chooses from. Each implements the
`ForgeTool` interface (`src/forge/types.ts`) and lives in `src/forge/tools/`. The
model picks a tool based on its `description`, calls it with validated input, and
the tool returns structured JSON.

All tools read the client's brand voice from `ctx.client.brandVoice`, so output
is on-brand by construction. Tools that call the LLM parse a JSON block from the
response with `parseJsonBlock()`; if parsing fails (malformed model output), they
fall back to an empty result rather than throwing.

> **Guardrails:** the report and competitor tools are explicitly instructed never
> to invent numbers or facts — they work only from provided data plus general
> category knowledge.

---

## `create_social_posts`

Generate ready-to-publish social posts in the client brand voice.

**Input**

| Field | Type | Default | Notes |
|---|---|---|---|
| `platform` | `instagram` \| `facebook` \| `google_business` | `instagram` | |
| `count` | integer 1–10 | `3` | Number of posts. |
| `topic` | string | — | What the posts are about (launch, promo, season…). |
| `cta` | string | — | Optional call to action woven in naturally. |

**Output**

```jsonc
{
  "platform": "instagram",
  "count": 3,
  "posts": [
    { "caption": "...", "hashtags": ["..."], "image_direction": "..." }
  ]
}
```

---

## `draft_review_responses`

Draft on-brand replies to customer reviews, calibrated to each rating, flagging
any that need a manager. Used by the **review-sweep** cron and on demand.

**Input**

| Field | Type | Notes |
|---|---|---|
| `reviews` | array (min 1) of `{ author?, rating, text }` | `author` defaults to `"Customer"`; `rating` is 1–5. |

**Output** — an array, one item per review:

```jsonc
[
  { "author": "Jane", "rating": 5, "reply": "...", "needs_manager": false }
]
```

`needs_manager` is set `true` for anything alleging illness, injury,
discrimination, or demanding a refund. The model is told to acknowledge, apologize
sincerely, and offer to make it right offline for low ratings — never defensive.

---

## `generate_report`

Turn provided metrics and highlights into a clear, on-brand performance report.
**Never invents numbers** — it interprets only what you give it.

**Input**

| Field | Type | Default | Notes |
|---|---|---|---|
| `period` | string | — | e.g. `"April 2026"` or `"Q1 2026"`. |
| `metrics` | array of `{ name, value, period?, change? }` | `[]` | Real metrics as text, e.g. `{ "name": "Instagram followers", "value": "1,240", "change": "+8%" }`. |
| `highlights` | string[] | `[]` | Notable activities (launches, campaigns, events). |

**Output**

```jsonc
{
  "period": "April 2026",
  "executive_summary": "...",
  "whats_working": ["..."],
  "needs_attention": ["..."],
  "recommended_actions": ["..."]
}
```

If no metrics are provided, the report stays qualitative and notes the missing
data rather than fabricating numbers.

---

## `research_keywords`

Generate clustered SEO keyword ideas with search intent and a content angle per
cluster. When `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` are configured, the
tool also enriches generated keywords with real DataForSEO Keyword Overview
metrics and a directional opportunity score computed only from returned provider
fields. Without those credentials it stays in ideation-only mode and says so.

**Input**

| Field | Type | Default | Notes |
|---|---|---|---|
| `topic` | string | — | Product, service, or theme. |
| `location` | string | — | Geographic focus for local intent, e.g. `"Jersey City, NJ"`. |
| `count` | integer 5–40 | `20` | Approximate number of ideas. |

**Output**

```jsonc
{
  "topic": "...",
  "clusters": [
    {
      "theme": "...",
      "intent": "informational" | "commercial" | "transactional" | "local",
      "keywords": ["..."],
      "content_angle": "..."
    }
  ],
  "keyword_metrics": [
    {
      "keyword": "...",
      "search_volume": 1200,
      "keyword_difficulty": 42,
      "cpc": 3.14,
      "competition": 0.37,
      "competition_level": "MEDIUM",
      "search_intent": "commercial",
      "opportunity_score": 62,
      "opportunity_label": "high",
      "monthly_searches": [{ "year": 2026, "month": 6, "search_volume": 1200 }],
      "source": "dataforseo"
    }
  ],
  "data_source": {
    "provider": "dataforseo",
    "configured": true,
    "location": "2840",
    "language": "en"
  },
  "note": "Keyword clusters are LLM-generated; volume, CPC, competition, search intent, and difficulty metrics are from DataForSEO Keyword Overview."
}
```

---

## `analyze_competitors`

Analyze named competitors against the client to find positioning gaps and
opportunities. Works from the details you provide plus general category
knowledge — **does not fabricate** specific facts like pricing or traffic, and
hedges inferences with "likely".

**Input**

| Field | Type | Notes |
|---|---|---|
| `competitors` | array (min 1) of `{ name, notes? }` | `notes` = anything known: positioning, strengths, URL, observations. |
| `focus` | string | Optional angle, e.g. `"social presence"` or `"pricing"`. |

**Output**

```jsonc
{
  "summary": "...",
  "per_competitor": [
    { "name": "...", "likely_strengths": ["..."], "likely_gaps": ["..."] }
  ],
  "where_client_wins": ["..."],
  "opportunities": ["..."],
  "recommended_positioning": "..."
}
```

---

## How tools are invoked

You don't call tools directly — you give `runForge` a natural-language task and
the model selects the tool:

```bash
npm run forge:run -- acme-coffee "Write 3 Instagram posts for a new oat-milk cold brew"
# → model calls create_social_posts

npm run forge:run -- acme-coffee "Find SEO keyword clusters for cold brew in Jersey City"
# → model calls research_keywords
```

To add your own tool, see [Extending Forge](./extending.md).
