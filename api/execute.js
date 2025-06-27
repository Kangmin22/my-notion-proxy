// api/execute.js
const { createClient } = require('@vercel/kv');
const yaml = require('js-yaml');
const Airtable = require('airtable');

// Vercel KV 클라이언트 초기화
const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

// Airtable 클라이언트 초기화
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;


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
  storeToAirtable: {
    description: "결과를 새로운 Airtable 레코드에 저장.",
    function: async (text, context) => {
      console.log("Executing: storeToAirtable");
      
      const newRecord = {
        "Prompt Name": `Execution Result - ${new Date().toISOString()}`,
        "Status": "최종 완료",
        "Goal": String(text) // 결과를 Goal 필드에 저장
      };

      const createdRecords = await base(tableName).create([{ fields: newRecord }]);
      return `Stored result in Airtable. Record ID: ${createdRecords[0].getId()}`;
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

async function getRecordByName(promptName) {
    const cacheKey = `prompt_name:${promptName}`;
    const cachedRecord = await kv.get(cacheKey);
    if (cachedRecord) {
        console.log(`Cache HIT for ${promptName}.`);
        return cachedRecord;
    }

    console.log(`Cache MISS for ${promptName}. Querying Airtable...`);
    const records = await base(tableName).select({
        filterByFormula: `{Prompt Name} = "${promptName}"`,
        maxRecords: 1
    }).firstPage();

    if (records.length === 0) {
        throw new Error(`Prompt '${promptName}' not found in Airtable.`);
    }
    
    const record = records[0];
    const result = {
        id: record.getId(),
        yaml_script: record.get('YAML Script'),
    };
    
    await kv.set(cacheKey, result, { ex: 3600 }); // 1시간 동안 캐시
    return result;
}

module.exports = async (request, response) => {
  console.log("Execution Engine for Airtable started.");
  try {
    const { prompt_name, input_data } = request.body;

    if (!prompt_name || !input_data) {
      return response.status(400).json({ 
        error: "Missing prompt_name or input_data.",
        stage: "Input Validation"
      });
    }
    
    const moduleRecord = await getRecordByName(prompt_name);
    const langScriptYAML = moduleRecord.yaml_script;

    if (!langScriptYAML) {
      return response.status(400).json({ error: "No valid LangScript YAML content found in the Airtable record." });
    }

    const langScript = yaml.load(langScriptYAML);
    const steps = langScript.steps;
    if (!steps || !Array.isArray(steps)) {
      return response.status(400).json({ error: "Invalid LangScript format: 'steps' missing or not an array." });
    }
    
    const idToFunctionMap = {
      extract_input: "getTextFromInput",
      summarize: "summarizeText",
      finalize: "logOutput",
      format_list: "formatList",
      store_result: "storeToAirtable",
    };

    let currentState = input_data;

    for (const step of steps) {
      const functionName = step.function || idToFunctionMap[step.id];
      const funcData = primitiveFunctions[functionName];
      if (funcData && typeof funcData.function === 'function') {
        currentState = await funcData.function(currentState);
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
