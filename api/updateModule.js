// api/updateModule.js
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;

module.exports = async (request, response) => {
    console.log("Update Module API v2 started.");

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { id, fields_to_update } = request.body;

        if (!id || !fields_to_update) {
            return response.status(400).json({ error: 'Missing required fields: id and fields_to_update are required.' });
        }

        // [수정된 부분] API 요청 필드 이름을 Airtable 필드 이름으로 매핑
        const keyMap = {
            "prompt_name": "Prompt Name",
            "goal": "Goal",
            "yaml_script": "YAML Script",
            "version": "Version",
            "status": "Status",
            "tags": "Tags"
        };

        const airtableFields = {};
        for (const key in fields_to_update) {
            const mappedKey = keyMap[key];
            if (mappedKey) {
                airtableFields[mappedKey] = fields_to_update[key];
            } else {
                // 허용되지 않은 필드는 무시하거나 에러 처리할 수 있습니다.
                console.warn(`Unrecognized field '${key}' in update request will be ignored.`);
            }
        }
        
        if (Object.keys(airtableFields).length === 0) {
            return response.status(400).json({ error: 'No valid fields to update were provided.' });
        }

        const updatedRecords = await base(tableName).update([
            {
                "id": id,
                "fields": airtableFields // 변환된 필드 객체를 사용
            }
        ]);

        const updatedModule = {
            id: updatedRecords[0].getId(),
            fields: updatedRecords[0].fields
        };
        
        console.log(`Module with ID '${id}' updated successfully.`);
        response.status(200).json({ message: "Module updated successfully.", module: updatedModule });

    } catch (error) {
        console.error("Update Module Error:", error);
        response.status(500).json({ error: "Failed to update module in Airtable.", details: error.message });
    }
};
