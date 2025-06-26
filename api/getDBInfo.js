// api/getDBInfo.js
module.exports = async (request, response) => {
  try {
    const databaseId = request.body.database_id;
    if (!databaseId) {
      return response.status(400).json({ error: 'Proxy Error: Database ID is missing.' });
    }

    const notionApiUrl = `https://api.notion.com/v1/databases/${databaseId}`;
    const { headers } = request;
    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Notion-Version': '2022-06-28',
    };

    const notionResponse = await fetch(notionApiUrl, { method: 'GET', headers: notionHeaders });
    if (!notionResponse.ok) { /* ... */ }
    const data = await notionResponse.json();
    response.status(200).json(data.properties);

  } catch (error) { /* ... */ }
};
