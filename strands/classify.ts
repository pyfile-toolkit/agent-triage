// Strands Agents SDK adapter for the AGENT//triage classifier.
// Run:  bun strands/classify.ts "<owner/repo>" "<issue number>"
// Uses OpenRouter via OpenAI-compatible transport (no AWS account needed).
import { Agent } from '@strands-agents/sdk'
import { OpenAIModel } from '@strands-agents/sdk/models/openai'

const LLM_KEY = process.env.LLM_KEY || ''
if (!LLM_KEY) throw new Error('LLM_KEY env required (OpenRouter key)')

const model = new OpenAIModel({
  api: 'chat',
  modelId: process.env.LLM_MODEL || 'liquid/lfm-2.5-2.6b:free',
  apiKey: LLM_KEY,
  clientConfig: { baseURL: 'https://openrouter.ai/api/v1' },
  temperature: 0.2,
})

const agent = new Agent({ model })

const [repo = 'typeorm/typeorm', num = '12792'] = process.argv.slice(2)
const res = await fetch(`https://api.github.com/repos/${repo}/issues/${num}`, {
  headers: { 'User-Agent': 'strands-triage/0.1' },
})
const issue = await res.json()
if (!issue?.title) throw new Error(`no issue ${repo}#${num}: ${issue?.message || ''}`)

const prompt = `You are a strict GitHub triage assistant. Classify this issue:
---
#${issue.number} ${issue.title}
${(issue.body || '').slice(0, 1200)}
---
Respond with ONLY a JSON object, no markdown:
{"category":"bug|feature|question|duplicate|docs","short":"7-9 words","priority":1}
where priority 1=urgent/high-impact, 5=trivial.`

const out = await agent.invoke(prompt)
const txt = typeof out === 'string' ? out : (out as any)?.output ?? (out as any)?.text ?? JSON.stringify(out)
console.log('=== AGENT (Strands harness) ===')
console.log(String(txt).slice(0, 600))