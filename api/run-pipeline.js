// api/run-pipeline.js
const { createClient } = require('@vercel/kv');
const yaml = require('js-yaml');
const Airtable = require('airtable');
const { primitiveFunctions } = require('./shared_functions.js');

// ✅ 수정된 부분: UPSTASH 환경 변수를 사용하도록 수정
const kv = createClient({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;

async function getRecordByName(promptName) {
    const cacheKey = `prompt_name:${promptName}`;
    const cachedRecord = await kv.get(cacheKey);
    if (cachedRecord) {
        console.log(`Cache HIT for ${promptName}.`);
        return cachedRecord;
    }

    console.log(`Cache MISS for ${promptName}. Querying Airtable...`);
    
    // ✅ 수정된 부분: 프롬프트 이름에 따옴표가 있어도 오류가 나지 않도록 이스케이프 처리
    const escapedPromptName = promptName.replace(/"/g, '\\"');
    const filterFormula = `{Prompt Name} = "${escapedPromptName}"`;

    const records = await base(tableName).select({
        filterByFormula: filterFormula,
        maxRecords: 1
    }).firstPage();

    if (records.length === 0) {
        throw new Error(`Prompt '${promptName}' not found in Airtable.`);
    }
    
    const record = { id: records[0].getId(), yaml_script: records[0].get('YAML Script') };
    await kv.set(cacheKey, record, { ex: 3600 });
    return record;
}

module.exports = async (request, response) => {
    console.log("Pipeline Engine Refactored started.");
    try {
        const { module_names, initial_input_data } = request.body;

        if (!module_names || !Array.isArray(module_names) || module_names.length === 0 || !initial_input_data) {
            return response.status(400).json({ error: 'Missing required fields: module_names (array) and initial_input_data are required.' });
        }

        let currentState = initial_input_data;
        const execution_logs = [];

        for (const moduleName of module_names) {
            console.log(`--- Executing module in pipeline: ${moduleName} ---`);
            const moduleRecord = await getRecordByName(moduleName);
            const langScriptYAML = moduleRecord.yaml_script;
            if (!langScriptYAML) throw new Error(`No YAML script found for module: ${moduleName}`);
            
            const langScript = yaml.load(langScriptYAML);
            const steps = langScript.steps;
            if (!steps || !Array.isArray(steps)) throw new Error(`Invalid LangScript format in module: ${moduleName}`);

            let moduleState = currentState;

            for (const step of steps) {
                const functionName = step.function;
                const funcData = primitiveFunctions[functionName];
                if (!funcData) throw new Error(`Unknown function '${functionName}' in module '${moduleName}'`);
                
                moduleState = await funcData.function(moduleState);
                execution_logs.push(`Step '${functionName}' in '${moduleName}' executed successfully.`);
            }
            currentState = moduleState; 
        }

        response.status(200).json({ 
            message: `Pipeline executed successfully through ${module_names.length} modules.`,
            final_result: currentState,
            logs: execution_logs 
        });

    } catch (error) {
        console.error("Pipeline Engine Refactored Error:", error);
        response.status(500).json({ error: "Pipeline execution failed.", details: error.message });
    }
};
