// api/pipeline.js
const { createClient } = require('@vercel/kv');
const yaml = require('js-yaml');
const Airtable = require('airtable');
const { primitiveFunctions } = require('./shared_functions.js'); // 공통 파일에서 함수 목록 가져오기

// Vercel KV와 Airtable 클라이언트 초기화
const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;

// 이름으로 Airtable 레코드를 찾는 함수
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

// 파이프라인 실행기 메인 로직
module.exports = async (request, response) => {
    console.log("Pipeline Engine Refactored started.");

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
        let lastModuleName;
        let lastModuleSteps;
        
        const idToFunctionMap = {
          extract_input: "getTextFromInput",
          summarize: "summarizeText",
          finalize: "logOutput",
          format_list: "formatList",
          store_result: "storeToAirtable",
          export_document: "exportToDocumentSystem",
          trim: "trimWhitespace",
          normalize_lines: "normalizeNewlines",
          split: "splitByDelimiter",
          keywords: "extractKeywords",
          detect_lang: "detectLanguage",
          count_words: "countWords",
          md_code: "wrapInMarkdownCodeBlock",
          to_json: "wrapInJSON",
          to_table: "formatAsTable",
          to_file: "storeToFilesystem",
          webhook: "sendToWebhook",
          push_history: "pushToHistoryKV",
          log: "logInput",
          pass: "noop",
          now: "timestamp",
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
                try {
                    moduleState = await funcData.function(moduleState);
                } catch (stepError) {
                    execution_logs.push(`[FALLBACK] Step '${functionName}' in '${moduleName}' failed. Error: ${stepError.message}. Preserving input as output.`);
                    moduleState = stepInput; 
                }
                
                const outputLog = typeof moduleState === 'object' ? JSON.stringify(moduleState) : moduleState;
                execution_logs.push(`Step '${functionName}' in '${moduleName}' executed. Output: ${outputLog}`);
            }
            
            const snapshotKey = `pipeline_snapshot:${moduleName}:${Date.now()}`;
            await kv.set(snapshotKey, moduleState, { ex: 86400 }); 
            execution_logs.push(`Snapshot for module '${moduleName}' saved to KV with key: ${snapshotKey}`);

            currentState = moduleState; 
            finalResult = moduleState; 
        }

        if (output_format === "structured") {
            response.status(200).json({ message: `Pipeline executed successfully.`, final_module: { name: lastModuleName, steps: lastModuleSteps }, final_result: finalResult, logs: execution_logs });
        } else {
            response.status(200).json({ message: `Pipeline executed successfully through ${module_names.length} modules.`, final_result: finalResult, logs: execution_logs });
        }
    } catch (error) {
        console.error("Pipeline Engine Refactored Error:", error);
        response.status(500).json({ error: "Pipeline execution failed.", details: error.message });
    }
};
