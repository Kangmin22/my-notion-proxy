// api/createModule.js
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;

module.exports = async (request, response) => {
    console.log("Create Module API started.");

    // POST 요청이 아니면 에러 처리
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { prompt_name, goal, yaml_script, version, status, tags } = request.body;

        // 필수 필드 확인
        if (!prompt_name || !yaml_script) {
            return response.status(400).json({ error: 'Missing required fields: prompt_name and yaml_script are required.' });
        }

        const newRecord = {
            "Prompt Name": prompt_name,
            "Goal": goal || "", // 값이 없으면 빈 문자열
            "YAML Script": yaml_script,
            "Version": version || 1.0, // 값이 없으면 1.0
            "Status": status || "작성 중", // 값이 없으면 '작성 중'
            "Tags": tags || [] // 값이 없으면 빈 배열
        };
        
        const createdRecords = await base(tableName).create([
            { fields: newRecord }
        ]);

        const createdModule = {
            id: createdRecords[0].getId(),
            fields: createdRecords[0].fields
        };
        
        console.log(`Module '${prompt_name}' created successfully. Record ID: ${createdModule.id}`);
        response.status(201).json({ message: "Module created successfully.", module: createdModule });

    } catch (error) {
        console.error("Create Module Error:", error);
        response.status(500).json({ error: "Failed to create module in Airtable.", details: error.message });
    }
};
