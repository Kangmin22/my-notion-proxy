// api/createModule.js
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;

module.exports = async (request, response) => {
    console.log("Create Module API v3 (YAML Generator) started.");

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { prompt_name, goal, steps, version, status, tags } = request.body;

        if (!prompt_name || !steps || !Array.isArray(steps)) {
            return response.status(400).json({ error: 'Missing required fields: prompt_name and a steps array are required.' });
        }

        // [수정된 부분] id: 대신 function: 을 사용하도록 변경
        const stepsYAML = steps.map(step => `  - function: ${step}`).join('\n');
        const finalYAML = `goal: ${goal || 'No goal specified.'}\nsteps:\n${stepsYAML}`;

        const newRecord = {
            "Prompt Name": prompt_name,
            "Goal": goal || "",
            "YAML Script": finalYAML,
            "Version": version || 1.0,
            "Status": status || "작성 중",
            "Tags": tags || []
        };
        
        const createdRecords = await base(tableName).create([{ fields: newRecord }]);

        const createdModule = {
            id: createdRecords[0].getId(),
            fields: createdRecords[0].fields
        };
        
        console.log(`Module '${prompt_name}' created successfully with generated YAML.`);
        response.status(201).json({ message: "Module created successfully.", module: createdModule });

    } catch (error) {
        console.error("Create Module Error:", error);
        response.status(500).json({ error: "Failed to create module in Airtable.", details: error.message });
    }
};
