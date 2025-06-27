// api/updateModule.js
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;

module.exports = async (request, response) => {
    console.log("Update Module API started.");

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { id, fields_to_update } = request.body;

        // 필수 필드 확인
        if (!id || !fields_to_update) {
            return response.status(400).json({ error: 'Missing required fields: id and fields_to_update are required.' });
        }

        const updatedRecords = await base(tableName).update([
            {
                "id": id,
                "fields": fields_to_update
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
