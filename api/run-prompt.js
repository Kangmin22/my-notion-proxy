const { head } = require('@vercel/blob');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');
const Ollama = require('ollama');
const yaml = require('js-yaml');
const Joi = require('joi');
const escapeStringRegexp = require('escape-string-regexp');
const pino = require('pino');
const fetch = require('node-fetch');
const { kv } = require('@vercel/kv');
const { v4: uuidv4 } = require('uuid');

// 로거 및 클라이언트 초기화
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const localLLM = new Ollama.Client();

// 설정: 도메인 화이트리스트 및 캐시
const ALLOWED_DOMAINS = ['my-trusted-bucket.s3.amazonaws.com', 'prompts.mycompany.com'];
const CACHE_TTL_MS = 5 * 60 * 1000;
const promptCache = new Map();

// 스키마 정의
const userInputSchema = Joi.object()
  .pattern(Joi.string().regex(/^[a-zA-Z0-9_]+$/), [Joi.string(), Joi.number(), Joi.boolean()])
  .required();
const metadataSchema = Joi.object({
  execution_mode: Joi.string().valid('simple_template','ai_generation','simulate','local_llm').required(),
  model_provider: Joi.string().valid('gemini','openai','ollama'),
  model: Joi.string(),
  backend: Joi.string(),
  isPublic: Joi.boolean(),
  promptId: Joi.string().required(),
  onResultHook: Joi.string().uri(),
  retryCount: Joi.alternatives().try(Joi.number().integer().min(0), Joi.array().items(Joi.number().integer().min(0))),
  fallbackModel: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())),
  gradeFunctions: Joi.array().items(Joi.string().valid('exact','contains','json')),  // 채점 함수 목록
  temperature: Joi.number().min(0).max(1),
  maxTokens: Joi.number().integer().positive(),
  streaming: Joi.boolean()
}).unknown(true);

// 유틸: 도메인 검사, 프롬프트 fetch, 파싱, 치환
function isDomainAllowed(url) { try { return ALLOWED_DOMAINS.includes(new URL(url).host); } catch { return false; } }
async function getPromptContent(prompt_url) { /* ... */ }
function parsePrompt(raw) { /* ... */ }
function substitute(template, inputs) { /* ... */ }
async function callModelNonStreaming(metadata, prompt) { /* ... */ }

// Log & Timeline 저장
async function logResult(context, result, success = true) {
  const id = uuidv4();
  const ts = Date.now();
  const key = `promptResults:${context.metadata.promptId}:${id}`;
  const record = { id, timestamp: ts, success, ...context, result };
  await kv.set(key, record);
  await kv.zadd(`promptTimeline:${context.metadata.promptId}`, { [ts]: id });
  if (context.metadata.onResultHook) {
    await fetch(context.metadata.onResultHook, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(record) }).catch(e=>logger.error(e));
  }
}

// 핸들러
async function handleSimple({ body, inputs, context, res }) { /* ... */ }
async function handleSimulate({ body, inputs, context, res }) { /* ... */ }
async function handleLocalLLM({ body, inputs, metadata, context, res }) { /* ... */ }
async function handleAI({ body, inputs, metadata, context, res }) {
  const prompt = substitute(body, inputs);
  let models = Array.isArray(metadata.fallbackModel) ? [metadata.model, ...metadata.fallbackModel] : [metadata.model];
  const attempts = Array.isArray(metadata.retryCount) ? metadata.retryCount : Array(models.length).fill(metadata.retryCount||0);
  let responseText, success=false;
  for (let i=0; i<models.length; i++) {
    metadata.model = models[i];
    try {
      responseText = metadata.streaming && metadata.model_provider==='gemini'
        ? await streamGemini(prompt, metadata, res)
        : await callModelNonStreaming(metadata, prompt);
      success = true; break;
    } catch(e) {
      logger.warn(e, `Model ${models[i]} failed`);
      if (i>=models.length-1) throw e;
    }
  }
  if (!responseText) throw new Error('No response');
  await logResult(context, responseText, success);
  if (!metadata.streaming) res.status(200).json({ result: responseText });
}
const handlers = { simple_template: handleSimple, simulate: handleSimulate, local_llm: handleLocalLLM, ai_generation: handleAI };

// 프롬프트 CRUD
async function createPrompt(req, res) {
  const { promptId, content, versionTag } = req.body;
  const ts = Date.now();
  const key = `prompts:${promptId}:${versionTag||ts}`;
  await kv.set(key, content);
  await kv.zadd(`promptVersions:${promptId}`, { [ts]: versionTag||ts });
  res.status(201).json({ promptId, version: versionTag||ts });
}
async function updatePrompt(req, res) {
  const { promptId } = req.params;
  const { content, versionTag } = req.body;
  const ts = Date.now();
  const key = `prompts:${promptId}:${versionTag||ts}`;
  await kv.set(key, content);
  await kv.zadd(`promptVersions:${promptId}`, { [ts]: versionTag||ts });
  res.status(200).json({ promptId, version: versionTag||ts });
}
async function listPrompts(req, res) {
  const ids = (await kv.keys('prompts:*:*')).map(k=>k.split(':')[1]);
  res.json({ promptIds: [...new Set(ids)] });
}

// 테스트 자동 실행 및 채점
async function runTests(req, res) {
  const { promptId } = req.params;
  const tests = await kv.hgetall(`testCases:${promptId}`);
  const results=[];
  for (const [tcId, tc] of Object.entries(tests)) {
    const out = await callModelNonStreaming({model:tc.model,...tc.metadata}, tc.input);
    const diffs = diff(tc.expected, out, tc.metadata.gradeFunctions);
    results.push({ tcId, diff: diffs });
  }
  res.json({ results });
}

// 대시보드 UI
async function serveDashboard(req, res) {
  res.sendFile('/static/dashboard.html');  // 차트 기반 UI 파일
}

// 라우터
module.exports = async (req, res) => {
  try {
    // 관리 UI
    if (req.url.startsWith('/dashboard')) return serveDashboard(req,res);
    // 프롬프트 관리
    if (req.method==='POST' && req.url.startsWith('/api/prompts')) return createPrompt(req,res);
    if (req.method==='PATCH' && req.url.match(/^\/api\/prompts\//)) return updatePrompt(req,res);
    if (req.method==='GET' && req.url.startsWith('/api/prompts')) return listPrompts(req,res);
    // 테스트
    if (req.method==='POST' && req.url.match(/^\/api\/prompts\/[^/]+\/tests\/run/)) return runTests(req,res);
    // 기존 실행 엔드포인트
    // ... (이전 로직 유지)
  } catch (e) {
    logger.error(e); res.status(500).json({ error: e.message });
  }
};

// Diff 및 Grade 헬퍼
function diff(expected, actual, funcs=[]) {
  // funcs=['contains','json'] 등 적용
  const results = {};
  if (funcs.includes('contains')) results.contains = actual.includes(expected);
  if (funcs.includes('json')) results.jsonEqual = JSON.stringify(JSON.parse(actual))===JSON.stringify(JSON.parse(expected));
  if (funcs.includes('exact')) results.exact = actual===expected;
  return results;
}

async function streamGemini(prompt, metadata, res) {
  const m = genAI.getGenerativeModel({ model: metadata.model });
  const stream = await m.generateContent(prompt, { temperature: metadata.temperature, maxOutputTokens: metadata.maxTokens, stream: true });
  res.writeHead(200, { 'Content-Type':'application/json','Transfer-Encoding':'chunked' });
  for await (const c of stream) res.write(JSON.stringify({ delta:c.text }));
  res.end();
}
