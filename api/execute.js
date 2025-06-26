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
    description: "입력 객체에서 'text' 속성 값을 추출합니다.",
    function: (input) => {
      console.log("Executing: getTextFromInput");
      if (input && typeof input.text === 'string') return input.text;
      throw new Error("Invalid input for getTextFromInput.");
    }
  },
  summarizeText: {
    description: "텍스트를 50자 이내로 요약합니다.",
    function: (text) => {
      console.log("Executing: summarizeText");
      if (typeof text !== 'string') throw new Error("Invalid input for summarizeText.");
      return text.substring(0, 50) + "... (summarized)";
    }
  },
  formatList: {
    description: "개행 문자 기준 목록으로 포맷.",
    function: (text) => {
      console.log("Executing: formatList");
      if (typeof text !== 'string') throw new Error("Invalid input for formatList.");
      return text.split('\n').map(line => `- ${line}`).join('\n');
    }
  },
  storeToNotion: {
    description: "결과를 새로운 노션 페이지 코드 블럭에 저장.",
    function: async (text, context) => {
      console.log("Executing: storeToNotion");
      const { headers, databaseId } = context;
      const notionApiUrl = 'https://api.notion.com/v1/pages';
      const body = {
        parent: { database_id: databaseId },
        properties: {
          "Prompt Name": { title: [{ text: { content: `Execution Result - ${new Date().toISOString()}` } }] },
          "Status": { status: { name: "최종 완료" } },
        },
        children: [{
          object: 'block',
          type: 'code',
          code: { rich_text: [{ text: { content: String(text) } }], language: 'plain text' }
        }]
      };
      const res = await fetch(notionApiUrl, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(`Failed to store result in Notion: ${JSON.stringify(errorData)}`);
      }
      const data = await res.json();
      return `Stored result in Notion. Page ID: ${data.id}`;
    }
  },
  logOutput: {
    description: "최종 결과 로그 문자열 생성.",
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
      console.log(`Cache HIT for ${promptName}. Page ID: ${cachedId}`);
      return cachedId;
    }
  }
  const queryUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
  const queryBody = { filter: { property: "Prompt Name", title: { equals: promptName } } };
  const res = await fetch(queryUrl, { method: 'POST', headers: notionHeaders, body: JSON.stringify(queryBody) });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(`Notion Query Error: ${res.status} ${JSON.stringify(errorData)}`);
  }
  const data = await res.json();
  if (data.results.length !== 1) throw new Error(`Prompt '${promptName}' not uniquely found.`);
  const pageId = data.results[0].id;
  if (kv) await kv.set(`prompt_name:${promptName}`, pageId, { ex: 3600 });
  return pageId;
}

module.exports = async (request, response) => {
  console.log("Execution Engine v3.1 started.");
  try {
    let { page_id, prompt_name, input_data } = request.body;
    const databaseId = "21d33048babe80d09d09e923f6e99c54";

    if ((!page_id && !prompt_name) || !input_data) {
      return response.status(400).json({ 
        error: "Missing page_id or prompt_name, or input_data.",
        stage: "Input Validation"
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
        error: "Failed to retrieve LangScript module from Notion.",
        stage: "Module Retrieval",
        details: errorData
      });
    }

    const blocks = await notionRes.json();
    const codeBlock = blocks.results.find(b => b.type === 'code');
    const langScriptYAML = codeBlock?.code?.rich_text?.[0]?.text?.content;

    if (!langScriptYAML) {
      return response.status(400).json({ error: "No valid LangScript code block found." });
    }

    const langScript = yaml.load(langScriptYAML);
    const steps = langScript.steps;
    if (!steps || !Array.isArray(steps)) {
      return response.status(400).json({ error: "Invalid LangScript format: 'steps' missing." });
    }

    const idToFunctionMap = {
      extract_input: "getTextFromInput",
      summarize: "summarizeText",
      finalize: "logOutput",
      format_list: "formatList",
      store_result: "storeToNotion",
    };

    let currentState = input_data;
    const executionContext = { headers: notionHeaders, databaseId };

    for (const step of steps) {
      const functionName = step.function || idToFunctionMap[step.id];
      const funcData = primitiveFunctions[functionName];
      if (funcData && typeof funcData.function === 'function') {
        currentState = await funcData.function(currentState, executionContext);
      } else {
        return response.status(400).json({ error: `Unknown function: ${functionName}` });
      }
    }

    response.status(200).json({ final_result: currentState });

  } catch (error) {
    console.error('Execution Engine Error:', error);
    response.status(500).json({ 
      error: 'Execution failed.', 
      details: error.message 
    });
  }
};
