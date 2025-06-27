// api/run-pipeline.js
const yaml = require('js-yaml');
const { primitiveFunctions } = require('./shared_functions.js');
const { getRecordByName } = require('./_lib/airtable.js');

module.exports = async (request, response) => {
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
                if (!funcData) throw new Error(`Unknown function '${functionName}'`);
                currentState = await funcData.function(currentState);
            }
        }
        response.status(200).json({ final_result: currentState });

    } catch (error) {
        console.error("Pipeline Engine Error:", error);
        response.status(500).json({ error: "Pipeline execution failed.", details: error.message });
    }
};
