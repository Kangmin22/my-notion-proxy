// api/append.js
module.exports = async (request, response) => {
  try {
    const pageId = request.body.page_id;
    const blockText = request.body.block_text;

    if (!pageId || !blockText) {
      return response.status(400).json({ error: 'Proxy Error: page_id or block_text is missing.' });
    }

    const notionApiUrl = `https://api.notion.com/v1/blocks/${pageId}/children`;
    const { headers } = request;

    const notionRequestBody = {
      "children": [
        { "object": "block", "type": "code",
          "code": { "rich_text": [{ "type": "text", "text": { "content": blockText } }], "language": "yaml" }
        }
      ]
    };

    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };

    const notionResponse = await fetch(notionApiUrl, { method: 'PATCH', headers: notionHeaders, body: JSON.stringify(notionRequestBody) });

    if (!notionResponse.ok) {
      const errorData = await notionResponse.json();
      throw new Error(`Notion API Error: ${notionResponse.status} ${JSON.stringify(errorData)}`);
    }

    const data = await notionResponse.json();
    response.status(200).json(data);
  } catch (error) {
    console.error('Proxy Error (/api/append):', error);
    response.status(500).json({ error: 'Proxy server encountered an error.', details: error.message });
  }
};
