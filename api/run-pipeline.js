// api/run-pipeline.js
const { createClient } = require('@vercel/kv');
const yaml = require('js-yaml');
const Airtable = require('airtable');
const { primitiveFunctions } = require('./shared_functions.js');

// ✅ 수정된 부분: UPSTASH 환경 변수 사용
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
    const escapedPromptName = promptName.replace(/"/g, '\\"');
    const filterFormula = `{Prompt Name} = "${escapedPromptName}"`;
    const records = await base(tableName).select({
        filterByFormula: filterFormula,
        maxRecords: 1
    }).firstPage();

    if (records.length === 0) throw new Error(`Prompt '${promptName}' not found in Airtable.`);
    
    const record = { id: records[0].getId(), yaml_script: records[0].get('YAML Script') };
    await kv.set(cacheKey, record, { ex: 3600 });
    return record;
}

module.exports = async (request, response) => {
    console.log("Pipeline Engine Refactored started.");
    try {
        const { module_names, initial_input_data } = request.body;

        if (!module_names || !Array.isArray(module_names) || !initial_input_data) {
            return response.status(400).json({ error: 'Missing required fields.' });
        }

        let currentState = initial_input_data;
        
        for (const moduleName of module_names) {
            const moduleRecord = await getRecordByName(moduleName);
            const langScriptYAML = moduleRecord.yaml_script;
            if (!langScriptYAML) throw new Error(`No YAML script found for module: ${moduleName}`);
            
            const langScript = yaml.load(langScriptYAML);
            const steps = langScript.steps;
            if (!steps || !Array.isArray(steps)) throw new Error(`Invalid LangScript format in module: ${moduleName}`);

            for (const step of steps) {
                const functionName = step.function;
                const funcData = primitiveFunctions[functionName];
                if (!funcData) throw new Error(`Unknown function '${functionName}' in module '${moduleName}'`);
                
                currentState = await funcData.function(currentState);
            }
        }
        response.status(200).json({ final_result: currentState });

    } catch (error) {
        console.error("Pipeline Engine Refactored Error:", error);
        response.status(500).json({ error: "Pipeline execution failed.", details: error.message });
    }
};
