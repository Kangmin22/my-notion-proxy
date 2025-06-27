// api/retrieveByName.js
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;

module.exports = async (request, response) => {
  console.log("Function 'retrieveByName' for Airtable started.");
  try {
    const promptName = request.body.prompt_name;

    if (!promptName) {
      return response.status(400).json({ error: 'Proxy Error: prompt_name is missing.' });
    }
    
    const escapedPromptName = promptName.replace(/"/g, '\\"');
    const filterFormula = `{Prompt Name} = "${escapedPromptName}"`;

    const records = await base(tableName).select({
      filterByFormula: filterFormula,
      maxRecords: 1
    }).firstPage();

    if (records.length === 0) {
      return response.status(404).json({ error: `Prompt with name '${promptName}' not found in Airtable.` });
    }
    
    const record = records[0];
    const result = {
        page_id: record.getId(),
        name: record.get('Prompt Name'),
        status: record.get('Status'),
        tags: record.get('Tags'),
        version: record.get('Version'),
        goal: record.get('Goal'),
        yaml_script: record.get('YAML Script'),
    };

    response.status(200).json(result);

  } catch (error) {
      console.error("Airtable retrieveByName Error:", error);
      response.status(500).json({ error: "Failed to retrieve data from Airtable.", details: error.message });
  }
};
