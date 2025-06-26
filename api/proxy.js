// api/proxy.js
module.exports = async (request, response) => {
  try {
    const notionApiUrl = 'https://api.notion.com/v1/pages';
    const { headers, body } = request;

    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };

    const notionResponse = await fetch(notionApiUrl, {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify(body),
    });

    if (!notionResponse.ok) {
      const errorData = await notionResponse.json();
      throw new Error(`Notion API Error: ${notionResponse.status} ${JSON.stringify(errorData)}`);
    }

    const data = await notionResponse.json();
    response.status(200).json(data);
  } catch (error) {
    console.error('Proxy Error (/api/proxy):', error);
    response.status(500).json({ error: 'Proxy server failed', details: error.message });
  }
};
