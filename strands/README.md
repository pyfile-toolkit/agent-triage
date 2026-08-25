# Strands Agents SDK — AGENT//triage adapter

This sub-folder contains the same triage classifier rebuilt as a **Strands
Agents** agent (`@strands-agents/sdk`), the harness the Agents for Humans
hackathon requires. It drives an LLM through the OpenAI-compatible transport
pointed at OpenRouter — no AWS account needed, same JSON classification
contract, same results.

## Run

```bash
npm install                     # installs @strands-agents/sdk + openai
export LLM_KEY="<openrouter key>"     # or LLM_MODEL to override
bun strands/classify.ts typeorm/typeorm 12792
```

Example output (Strands harness, stopReason `endTurn`):

```
{"category":"bug","short":"Unconditional nested join parentheses cause planner regressions.","priority":1}
```

## Design notes

- `OpenAIModel` with `api:'chat'`, `clientConfig.baseURL: https://openrouter.ai/api/v1`
  — transports any OpenAI-compatible endpoint into the Strands harness
  (Bedrock/Anthropic/Google are drop-in alternatives).
- The full repo (`server.mjs` + `index.html`) shows the agent loop end-to-end:
  GitHub fetch → per-item LLM classification with model rotation → prioritized
  dashboard. This folder proves the same brain runs inside Strands.