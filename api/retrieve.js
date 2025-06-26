// api/retrieve.js
module.exports = async (request, response) => {
    try {
        const pageId = request.body.page_id;
        const startCursor = request.body.start_cursor;

        if (!pageId) {
            return response.status(400).json({ error: 'Proxy Error: page_id is missing.' });
        }

        let notionApiUrl = `https://api.notion.com/v1/blocks/${pageId}/children`;
        if (startCursor) {
            notionApiUrl += `?start_cursor=${startCursor}`;
        }

        const { headers } = request;
        const notionHeaders = {
            'Authorization': headers['authorization'],
            'Notion-Version': '2022-06-28',
        };

        const notionResponse = await fetch(notionApiUrl, { method: 'GET', headers: notionHeaders });

        if (!notionResponse.ok) {
            const errorData = await notionResponse.json();
            throw new Error(`Notion API Error: ${notionResponse.status} ${JSON.stringify(errorData)}`);
        }

        const data = await notionResponse.json();
        response.status(200).json(data);
    } catch (error) {
        console.error('Proxy Error (/api/retrieve):', error);
        response.status(500).json({ error: 'Proxy server failed', details: error.message });
    }
};
