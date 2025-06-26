// api/execute.js
import { createClient } from '@vercel/kv';
import yaml from 'js-yaml';

// KV 클라이언트 초기화 (환경 변수가 있을 때만)
let kv;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

// --- 기초 함수 라이브러리 정의 ---
const primitiveFunctions = {
  // 입력 데이터를 그대로 반환하는 가장 기본적인 함수
  getTextFromInput: (input) => {
    console.log("Executing: getTextFromInput");
    if (input && typeof input.text === 'string') {
        return input.text;
    }
    throw new Error("Invalid input for getTextFromInput: 'text' property is missing.");
  },
  // 텍스트를 간단히 요약하는 함수
  summarizeText: (text) => {
    console.log("Executing: summarizeText");
    if (typeof text !== 'string') return `Invalid input for summarization: Expected a string, but got ${typeof text}.`;
    return text.substring(0, 50) + "... (summarized)";
  },
  // 최종 결과를 로그 형태로 포맷하는 함수
  logOutput: (text) => {
    console.log("Executing: logOutput");
    return `[Execution Result Log]: ${text}`;
  },
};

export default async function handler(request, response) {
  console.log("Execution Engine started.");
  try {
    const { page_id, input_data } = request.body;
    if (!page_id || !input_data) {
      return response.status(400).json({ error: 'page_id and input_data are required.' });
    }

    const { headers } = request;
    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };

    // --- 1. Notion에서 LangScript 모듈 내용 가져오기 ---
    const notionBlocksUrl = `https://api.notion.com/v1/blocks/${page_id}/children`;
    const notionRes = await fetch(notionBlocksUrl, { method: 'GET', headers: notionHeaders });

    if (!notionRes.ok) {
        const errorData = await notionRes.json();
        throw new Error(`Notion Retrieve API Error: ${notionRes.status} ${JSON.stringify(errorData)}`);
    }
    const notionData = await notionRes.json();
    
    const codeBlock = notionData.results.find(block => block.type === 'code');
    if (!codeBlock || !codeBlock.code.rich_text[0]) {
      throw new Error(`No LangScript code block found on page ${page_id}.`);
    }
    const langScriptYAML = codeBlock.code.rich_text[0].plain_text;

    // --- 2. LangScript 파싱 ---
    const langScript = yaml.load(langScriptYAML);
    const steps = langScript.steps;
    if (!steps || !Array.isArray(steps)) {
      throw new Error("Invalid LangScript: 'steps' array not found in the YAML.");
    }

    // --- 3. 상태 관리 및 단계별 실행 ---
    let currentState = input_data; 
    console.log("Initial state:", currentState);

    for (const step of steps) {
      const functionName = step.function;
      if (primitiveFunctions[functionName]) {
        currentState = primitiveFunctions[functionName](currentState);
        console.log(`State after step '${functionName}':`, currentState);
      } else {
        throw new Error(`Unknown function in LangScript steps: ${functionName}`);
      }
    }

    // 최종 결과 반환
    console.log("Execution finished successfully.");
    response.status(200).json({ final_result: currentState });

  } catch (error) {
    console.error('Execution Engine Error:', error.message);
    response.status(500).json({ error: 'Execution Engine failed.', details: error.message });
  }
}
