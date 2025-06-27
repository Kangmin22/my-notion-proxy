// api/retrieveByName.js
const { getRecordByName, base, tableName } = require('./_lib/airtable.js');

module.exports = async (request, response) => {
  try {
    const promptName = request.body.prompt_name;
    if (!promptName) return response.status(400).json({ error: 'prompt_name is missing.' });
    
    const recordData = await getRecordByName(promptName);
    const fullRecord = await base(tableName).find(recordData.id);

    const result = {
        page_id: fullRecord.getId(),
        name: fullRecord.get('Prompt Name'),
        // ... 기타 필요한 모든 필드
        yaml_script: fullRecord.get('YAML Script'),
    };

    response.status(200).json(result);
  } catch (error) {
      console.error("retrieveByName Error:", error);
      response.status(500).json({ error: "Failed to retrieve data.", details: error.message });
  }
};
