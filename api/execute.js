// api/execute.js
import { createClient } from '@vercel/kv';
import yaml from 'js-yaml';

// Vercel KV 클라이언트 초기화 (환경 변수가 있을 때만)
let kv;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

// --- 기초 함수 라이브러리 정의 (자동 문서화를 위해 description 추가) ---
// 나중에 /api/functions.js 에서 이 객체를 가져와 사용할 수 있도록 export 합니다.
export const primitiveFunctions = {
  getTextFromInput: {
    description: "입력 객체에서 'text' 속성 값을 추출합니다. 파이프라인의 시작점에서 사용됩니다.",
    function: (input) => {
      console.log("Executing: getTextFromInput");
      if (input && typeof input.text === 'string') {
        return input.text;
      }
      // 입력 형식이 잘못되었을 때 표준화된 에러를 던집니다.
      throw new Error("Invalid input for getTextFromInput: The 'input_data' must be an object with a 'text' property.");
    }
  },
  summarizeText: {
    description: "주어진 텍스트를 50자 이내로 요약합니다.",
    function: (text) => {
      console.log("Executing: summarizeText");
      if (typeof text !== 'string') throw new Error("Invalid input for summarizeText: Expected a string.");
      return text.substring(0, 50) + "... (summarized)";
    }
  },
  formatList: {
    description: "개행(\\n)으로 구분된 텍스트를 글머리 기호(-) 목록으로 변환합니다.",
    function: (text) => {
      console.log("Executing: formatList");
      if (typeof text !== 'string') throw new Error("Invalid input for formatList: Expected a string.");
      return text.split('\n').map(line => `- ${line}`).join('\n');
    }
  },
  storeToNotion: {
    description: "결과 텍스트를 'Execution Result - [시간]'이라는 제목의 새 노션 페이지의 코드 블록에 저장합니다.",
    function: async (text, context) => {
      console.log("Executing: storeToNotion");
      const { headers, databaseId } = context;
      const addPageProxyUrl = 'https://my-notion-proxy.vercel.app/api/proxy'; // 기존 페이지 추가 프록시 재활용

      const notionRequestBody = {
        parent: { database_id: databaseId },
        properties: {
          "Prompt Name": { title: [{ text: { content: `Execution Result - ${new Date().toISOString()}` } }] },
          "Status": { status: { name: "최종 완료" } },
        },
        children: [{
          object: 'block', type: 'code',
          code: { rich_text: [{ text: { content: String(text) } }], language: 'text' }
        }]
      };

      const response = await fetch(addPageProxyUrl, {
        method: 'POST',
        headers: {
            'Authorization': headers['authorization'],
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(notionRequestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to store result in Notion: ${JSON.stringify(errorData)}`);
      }
      const data = await response.json();
      return `Successfully stored result in Notion. New Page ID: ${data.id}`;
    }
  },
  logOutput: {
    description: "최종 결과물을 '[Execution Result Log]:' 라는 접두사를 붙여 로그 형식의 문자열로 포맷합니다.",
    function: (text) => {
      console.log("Executing: logOutput");
      return `[Execution Result Log]: ${text}`;
    }
  },
};

// --- 헬퍼 함수: 이름으로 페이지 ID 조회 ---
async function getPageIdByName(promptName, notionHeaders, databaseId) {
    if (kv) {
        const cachedId = await kv.get(`prompt_name:${promptName}`);
        if (cachedId) return cachedId;
    }
    const queryUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
    const queryBody = { filter: { property: "Prompt Name", title: { equals: promptName } } };
    const res = await fetch(queryUrl, { method: 'POST', headers: notionHeaders, body: JSON.stringify(queryBody) });
    const data = await res.json();
    if (data.results.length === 0) throw new Error(`Prompt with name '${promptName}' not found.`);
    if (data.results.length > 1) throw new Error(`Multiple prompts found with name '${promptName}'. Please use page_id for clarity.`);
    const pageId = data.results[0].id;
    if (kv) await kv.set(`prompt_name:${promptName}`, pageId, { ex: 3600 });
    return pageId;
}

export default async function handler(request, response) {
  console.log("Execution Engine v1.1 started.");
  try {
    let { page_id, prompt_name, input_data } = request.body;
    const databaseId = "21d33048babe80d09d09e923f6e99c54";

    if ((!page_id && !prompt_name) || !input_data) {
      return response.status(400).json({ 
        error: "page_id or prompt_name, and input_data are required.",
        stage: "Input Validation",
        recommendation: "Please provide either a 'page_id' or a 'prompt_name' to execute, along with 'input_data'."
      });
    }

    const notionHeaders = {
      'Authorization': request.headers['authorization'],
      'Notion-Version': '2022-06-28',
    };
    
    if (prompt_name && !page_id) {
        page_id = await getPageIdByName(prompt_name, notionHeaders, databaseId);
    }

    const notionBlocksUrl = `https://api.notion.com/v1/blocks/${page_id}/children`;
    const notionRes = await fetch(notionBlocksUrl, { method: 'GET', headers: notionHeaders });

    if (!notionRes.ok) {
      const errorData = await notionRes.json();
      return response.status(404).json({ 
        error: "Failed to retrieve module from Notion.",
        stage: "Module Retrieval",
        details: errorData,
        recommendation: "Please check if the page_id is correct and the Notion page exists." 
      });
    }
    
    const blocks = await notionRes.json();
    const codeBlock = blocks.results.find(b => b.type === 'code');
    const langScriptYAML = codeBlock?.code?.rich_text?.[0]?.text?.content;

    if (!langScriptYAML) {
        return response.status(400).json({
            error: "No valid LangScript code block found on the Notion page.",
            stage: "YAML Parsing",
            recommendation: "Please ensure the target Notion page contains a valid YAML code block in its body."
        });
    }

    const langScript = yaml.load(langScriptYAML);
    const steps = langScript.steps;
    if (!steps || !Array.isArray(steps)) {
        return response.status(400).json({
            error: "Invalid LangScript format.",
            stage: "YAML Parsing",
            recommendation: "The YAML must contain a 'steps' key with a list of functions."
        });
    }

    let currentState = input_data; 
    const executionContext = { headers: notionHeaders, databaseId: databaseId };

    for (const step of steps) {
      const functionName = step.function;
      const funcData = primitiveFunctions[functionName];
      if (funcData && typeof funcData.function === 'function') {
        currentState = await funcData.function(currentState, executionContext);
      } else {
        return response.status(400).json({
            error: `Unknown or invalid function in LangScript steps: ${functionName}`,
            stage: "Function Execution",
            recommendation: `Check the function name in your LangScript. Available functions can be retrieved from the /api/functions endpoint.`
        });
      }
    }

    response.status(200).json({ final_result: currentState });

  } catch (error) {
    console.error('Execution Engine Critical Error:', error);
    response.status(500).json({ 
        error: 'Execution Engine failed with an unexpected error.', 
        stage: "Unknown",
        details: error.message,
        recommendation: "Please check the Vercel server logs for more details."
    });
  }
}
