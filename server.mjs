// AGENT // PR + Issue Triage — server.mjs
// Классифицирует открытые issues/PR репозитория через LLM (OpenRouter free tier).
// Локальный прототип для hackathon-сабмита. Ключ — из env LLM_KEY.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LLM_KEY = process.env.LLM_KEY || '';
const LLM_URL = 'https://openrouter.ai/api/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || '';
const LLM_MODELS = ['liquid/lfm-2.5-2.6b:free','thinkingmachines/inkling-small:free','nvidia/nemotron-3.5-lightning:free','poolside/laguna-s-2.1','cohere/north-mini-code:free'];
const MODELS = LLM_MODEL ? [LLM_MODEL] : LLM_MODELS;
const GH_TOKEN = process.env.GH_TOKEN || '';

async function gh(url) {
  const h = { 'User-Agent': 'triage-agent/0.1', Accept: 'application/vnd.github+json' };
  if (GH_TOKEN) h.Authorization = `token ${GH_TOKEN}`;
  const r = await fetch(url, { headers: h });
  if (!r.ok) throw new Error(`gh ${r.status} ${url}`);
  return r.json();
}

async function llmOnce(model, prompt) {
  const r = await fetch(LLM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_KEY}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`llm ${r.status}`);
  return (await r.json()).choices?.[0]?.message?.content || '';
}

async function classify(item) {
  const { number, title, body, type } = item;
  const prompt = `You are a strict GitHub triage assistant. Classify this ${type}:
---
#${number} ${title}
${(body || '').slice(0, 1200)}
---
Respond with ONLY a JSON object, no markdown:
{"category":"bug|feature|question|duplicate|docs","short":"7-9 words","priority":1} where priority 1=urgent/high-impact, 5=trivial`;
  let content = '';
  for (const model of MODELS) {
    try { content = await llmOnce(model, prompt); break; } catch {}
  }
  if (!content) throw new Error('llm failed');
  let j = {};
  try { j = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}'); } catch {}
  const p = Math.min(5, Math.max(1, parseInt(j.priority, 10) || 3));
  return { number, title: title.slice(0, 120), category: j.category || 'unknown', short: j.short || '', priority: p, raw: content.slice(0, 120) };
}

async function agent(repo) {
  const [owner, name] = repo.split('/').map(s => s.trim());
  if (!owner || !name) throw new Error('repo format: owner/name');
  const issues = await gh(`https://api.github.com/repos/${owner}/${name}/issues?state=open&per_page=50&sort=created&direction=desc`);
  const items = issues
    .filter(i => !i.pull_request)
    .slice(0, 14)
    .map(i => ({ number: i.number, title: i.title, body: i.body, type: 'issue' }));
  const prs = issues.filter(i => i.pull_request).slice(0, 8).map(i => ({ number: i.number, title: i.title, body: i.body, type: 'PR' }));
  const all = [...items, ...prs];
  const results = [];
  for (const it of all) {
    try { results.push(await classify(it)); } catch (e) { results.push({ number: it.number, title: it.title.slice(0, 100), category: 'error', short: e.message }); }
  }
  results.sort((a, b) => (a.priority || 3) - (b.priority || 3));
  return { repo, scanned_issues: all.length, results };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'GET' && u.pathname === '/') {
    const f = path.join(__dirname, 'index.html');
    if (existsSync(f)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(readFileSync(f)); return; }
  }
  if (req.method === 'GET' && u.pathname === '/api/agent') {
    const repo = u.searchParams.get('repo') || '';
    if (!LLM_KEY) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'LLM_KEY env missing' })); return; }
    try {
      const out = await agent(repo);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
    return;
  }
  res.writeHead(404); res.end('nf');
});

const PORT = process.env.PORT || 7811;
server.listen(PORT, () => console.log(`triage-agent on :${PORT}`));