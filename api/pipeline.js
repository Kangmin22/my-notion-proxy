// api/pipeline.js
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

// 모든 실행 가능한 기초 함수 모음
const primitiveFunctions = {
  getTextFromInput: {
    description: "입력 객체에서 'text' 속성 값을 추출합니다.",
    function: (input) => {
      console.log("Executing: getTextFromInput");
      if (input && typeof input.text === 'string') return input.text;
      // 입력이 객체가 아니라 이미 텍스트인 경우 그대로 반환
      if (typeof input === 'string') return input;
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
    function: async (text) => {
      console.log("Executing: storeToAirtable");
      const newRecord = {
        "Prompt Name": `Pipeline Result - ${new Date().toISOString()}`,
        "Status": "최종 완료",
        "Goal": String(text)
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

// 이름으로 Airtable 레코드를 찾는 함수 (캐시 기능 포함)
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

    if (records.length === 0) throw new Error(`Prompt '${promptName}' not found in Airtable.`);
    
    const record = { id: records[0].getId(), yaml_script: records[0].get('YAML Script') };
    await kv.set(cacheKey, record, { ex: 3600 });
    return record;
}

// 파이프라인 실행기 메인 로직 v2
module.exports = async (request, response) => {
    console.log("Pipeline Engine v2 started.");

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { module_names, initial_input_data, output_format } = request.body;

        if (!module_names || !Array.isArray(module_names) || module_names.length === 0 || !initial_input_data) {
            return response.status(400).json({ error: 'Missing required fields: module_names (array) and initial_input_data are required.' });
        }

        let currentState = initial_input_data;
        let finalResult;
        const execution_logs = [];

        // 구조화된 출력을 위한 마지막 모듈 정보 저장용 변수
        let lastModuleName;
        let lastModuleSteps;
        
        // 함수 ID와 실제 함수 이름을 매핑하는 객체
        const idToFunctionMap = {
          extract_input: "getTextFromInput",
          summarize: "summarizeText",
          finalize: "logOutput",
          format_list: "formatList",
          store_result: "storeToAirtable",
        };

        for (const moduleName of module_names) {
            console.log(`--- Executing module in pipeline: ${moduleName} ---`);
            const moduleRecord = await getRecordByName(moduleName);
            const langScriptYAML = moduleRecord.yaml_script;

            if (!langScriptYAML) throw new Error(`No YAML script found for module: ${moduleName}`);
            
            const langScript = yaml.load(langScriptYAML);
            const steps = langScript.steps;
            if (!steps || !Array.isArray(steps)) throw new Error(`Invalid LangScript format in module: ${moduleName}`);
            
            lastModuleName = moduleName;
            lastModuleSteps = steps;

            let moduleState = currentState;

            for (const step of steps) {
                const functionName = step.function || idToFunctionMap[step.id];
                const funcData = primitiveFunctions[functionName];
                if (!funcData) throw new Error(`Unknown function '${functionName}' in module '${moduleName}'`);
                
                const stepInput = moduleState;

                // 함수 실패에 대한 Fallback 전략
                try {
                    moduleState = await funcData.function(moduleState);
                } catch (stepError) {
                    execution_logs.push(`[FALLBACK] Step '${functionName}' in '${moduleName}' failed. Error: ${stepError.message}. Preserving input as output.`);
                    moduleState = stepInput; 
                }
                
                // Step별 로그 추적
                const outputLog = typeof moduleState === 'object' ? JSON.stringify(moduleState) : moduleState;
                execution_logs.push(`Step '${functionName}' in '${moduleName}' executed. Output: ${outputLog}`);
            }
            
            // 모듈별 output snapshot 저장
            const snapshotKey = `pipeline_snapshot:${moduleName}:${Date.now()}`;
            await kv.set(snapshotKey, moduleState, { ex: 86400 }); 
            execution_logs.push(`Snapshot for module '${moduleName}' saved to KV with key: ${snapshotKey}`);

            // 현재 모듈의 최종 결과를 다음 모듈의 입력으로 설정
            currentState = { text: moduleState }; 
            finalResult = moduleState; 
        }

        // 최종 결과를 LangScript 구조로 출력 옵션
        if (output_format === "structured") {
            response.status(200).json({
                message: `Pipeline executed successfully.`,
                final_module: {
                    name: lastModuleName,
                    steps: lastModuleSteps
                },
                final_result: finalResult,
                logs: execution_logs
            });
        } else {
            // 기본 출력 방식
            response.status(200).json({
                message: `Pipeline executed successfully through ${module_names.length} modules.`,
                final_result: finalResult,
                logs: execution_logs
            });
        }

    } catch (error) {
        console.error("Pipeline Engine v2 Error:", error);
        response.status(500).json({ error: "Pipeline execution failed.", details: error.message });
    }
};
