// api/run-pipeline.js (ID 직접 실행 테스트 버전)
const yaml = require('js-yaml');
const Airtable = require('airtable');
const { primitiveFunctions } = require('./shared_functions.js');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;

module.exports = async (request, response) => {
    console.log("Direct Execution Test started.");
    try {
        const { record_id, initial_input_data } = request.body;

        if (!record_id || !initial_input_data) {
            return response.status(400).json({ error: 'Missing required fields: record_id and initial_input_data are required.' });
        }
        
        // 이름으로 검색하는 대신, ID로 레코드를 직접 가져옵니다.
        const record = await base(tableName).find(record_id);
        const langScriptYAML = record.get('YAML Script');

        if (!langScriptYAML) throw new Error(`No YAML script found for record: ${record_id}`);
        
        const langScript = yaml.load(langScriptYAML);
        const steps = langScript.steps;
        if (!steps || !Array.isArray(steps)) throw new Error(`Invalid LangScript format in record: ${record_id}`);

        let currentState = initial_input_data;

        for (const step of steps) {
            const functionName = step.function;
            const funcData = primitiveFunctions[functionName];
            if (!funcData) throw new Error(`Unknown function '${functionName}'`);
            
            currentState = await funcData.function(currentState);
        }
        
        response.status(200).json({ final_result: currentState });

    } catch (error) {
        console.error("Direct Execution Test Error:", error);
        response.status(500).json({ error: "Direct execution failed.", details: error.message });
    }
};
