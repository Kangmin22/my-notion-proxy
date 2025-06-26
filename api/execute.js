// api/execute.js
const { createClient } = require('@vercel/kv');
const yaml = require('js-yaml');

let kv;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

const primitiveFunctions = {
  getTextFromInput: {
    description: "입력 객체에서 'text' 속성 값을 추출합니다. 파이프라인의 시작점에서 사용됩니다.",
    function: (input) => {
      console.log("Executing: getTextFromInput");
      if (input && typeof input.text === 'string') return input.text;
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
    description: "결과 텍스트를 새로운 노션 페이지의 코드 블록에 저장합니다.",
    function: async (text, context) => {
      console.log("Executing: storeToNotion");
      const { headers, databaseId } = context;
      const notionApiUrl = 'https://api.notion.com/v1/pages';
      const notionRequestBody = {
        parent: { database_id: databaseId },
        properties: {
          "Prompt Name": { title: [{ text: { content: `Execution Result - ${new Date().toISOString()}` } }] },
          "Status": { status: { name: "최종 완료" } },
        },
        children: [{
          object: 'block', type: 'code',
          code: { rich_text: [{ text: { content: String(text) } }], language: 'plain text' }
        }]
      };
      const response = await fetch(notionApiUrl, { method: 'POST', headers: headers, body: JSON.stringify(notionRequestBody) });
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
module.exports.primitiveFunctions = primitiveFunctions;

async function getPageIdByName(promptName, notionHeaders, databaseId) {
    if (kv) {
        const cacheKey = `prompt_name:${promptName}`;
        const cachedId = await kv.get(cacheKey);
        if (cachedId) {
            console.log(`Cache HIT for ${promptName}. Using Page ID: ${cachedId}`);
            return cachedId;
        }
    }
    const queryUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
    const queryBody = { filter: { property: "Prompt Name", title: { equals: promptName } } };
    const res = await fetch(queryUrl, { method: 'POST', headers: notionHeaders, body: JSON.stringify(queryBody) });
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(`Notion Query API Error while getting page ID: ${res.status} ${JSON.stringify(errorData)}`);
    }
    const data = await res.json();
    if (data.results.length === 0) throw new Error(`Prompt with name '${promptName}' not found.`);
    if (data.results.length > 1) throw new Error(`Multiple prompts found with name '${promptName}'. Please use page_id for clarity.`);
    const pageId = data.results[0].id;
    if (kv) {
        const cacheKey = `prompt_name:${promptName}`;
        await kv.set(cacheKey, pageId, { ex: 3600 });
    }
    return pageId;
}

module.exports = async (request, response) => {
  console.log("Execution Engine v3.0 (CJS) started.");
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
      'Content-Type': 'application/json',
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
        details: errorData
      });
    }
    
    const blocks = await notionRes.json();
    const codeBlock = blocks.results.find(b => b.type === 'code');
    const langScriptYAML = codeBlock?.code?.rich_text?.[0]?.text?.content;

    if (!langScriptYAML) {
        return response.status(400).json({ error: "No valid LangScript code block found on the Notion page." });
    }

    const langScript = yaml.load(langScriptYAML);
    const steps = langScript.steps;
    if (!steps || !Array.isArray(steps)) {
        return response.status(400).json({ error: "Invalid LangScript format: 'steps' array not found." });
    }

    let currentState = input_data; 
    const executionContext = { headers: notionHeaders, databaseId: databaseId };

    for (const step of steps) {
      const functionName = step.function;
      const funcData = primitiveFunctions[functionName];
      if (funcData && typeof funcData.function === 'function') {
        currentState = await funcData.function(currentState, executionContext);
      } else {
        return response.status(400).json({ error: `Unknown function in LangScript steps: ${functionName}` });
      }
    }

    response.status(200).json({ final_result: currentState });

  } catch (error) {
    console.error('Execution Engine Critical Error:', error);
    response.status(500).json({ 
        error: 'Execution Engine failed with an unexpected error.', 
        details: error.message
    });
  }
};
