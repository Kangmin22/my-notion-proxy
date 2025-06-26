// api/query.js
module.exports = async (request, response) => {
  try {
    const databaseId = request.body.database_id;
    if (!databaseId) {
      return response.status(400).json({ error: 'Database ID is missing.' });
    }

    const notionApiUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
    const { headers, body } = request;

    const notionRequestBody = {
      filter: body.filter,
      sorts: body.sorts,
    };

    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };

    const notionResponse = await fetch(notionApiUrl, {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify(notionRequestBody),
    });

    if (!notionResponse.ok) {
      const errorData = await notionResponse.json();
      throw new Error(`Notion API Error: ${notionResponse.status} ${JSON.stringify(errorData)}`);
    }

    const data = await notionResponse.json();
    response.status(200).json(data);
  } catch (error) {
    console.error('Proxy Error (/api/query):', error);
    response.status(500).json({ error: 'Proxy server failed', details: error.message });
  }
};
