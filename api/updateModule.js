// api/updateModule.js
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;

module.exports = async (request, response) => {
    console.log("Update Module API v4 (YAML Generator) started.");

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { id, fields_to_update } = request.body;

        if (!id || !fields_to_update) {
            return response.status(400).json({ error: 'Missing required fields: id and fields_to_update are required.' });
        }
        
        const airtableFields = {};
        
        // [수정된 부분] steps 배열이 들어오면, function: 을 사용하여 YAML을 새로 생성
        if (fields_to_update.steps && Array.isArray(fields_to_update.steps)) {
            const goal = fields_to_update.goal || 'No goal specified.';
            const stepsYAML = fields_to_update.steps.map(step => `  - function: ${step}`).join('\n');
            airtableFields["YAML Script"] = `goal: ${goal}\nsteps:\n${stepsYAML}`;
        }
        
        if (fields_to_update.prompt_name) airtableFields["Prompt Name"] = fields_to_update.prompt_name;
        if (fields_to_update.goal) airtableFields["Goal"] = fields_to_update.goal;
        if (fields_to_update.version) airtableFields["Version"] = fields_to_update.version;
        if (fields_to_update.status) airtableFields["Status"] = fields_to_update.status;
        if (fields_to_update.tags) airtableFields["Tags"] = fields_to_update.tags;

        if (Object.keys(airtableFields).length === 0) {
            return response.status(400).json({ error: 'No valid fields to update were provided.' });
        }

        const updatedRecords = await base(tableName).update([
            {
                "id": id,
                "fields": airtableFields
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
        response.status(500).json({ error: "Failed to create module in Airtable.", details: error.message });
    }
};
