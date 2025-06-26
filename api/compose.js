// api/compose.js
module.exports = async (request, response) => {
  try {
    const pageIds = request.body.page_ids;
    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
      return response.status(400).json({ error: 'Proxy Error: page_ids array is missing or empty.' });
    }

    const { headers } = request;
    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };

    const fetchPromises = pageIds.map(pageId => {
      const notionApiUrl = `https://api.notion.com/v1/blocks/${pageId}/children`;
      return fetch(notionApiUrl, { method: 'GET', headers: notionHeaders });
    });

    const responses = await Promise.all(fetchPromises);

    const jsonPromises = responses.map(res => {
      if (!res.ok) throw new Error(`Notion API Error: ${res.status}`);
      return res.json();
    });
    
    const results = await Promise.all(jsonPromises);

    let composedText = '';
    results.forEach((pageResult, index) => {
      composedText += `\n\n# --- Module ${index + 1} Content ---\n`;
      pageResult.results.forEach(block => {
        if (block.type === 'paragraph' && block.paragraph.rich_text.length > 0) {
          composedText += block.paragraph.rich_text.map(t => t.plain_text).join('') + '\n';
        }
      });
    });

    response.status(200).json({ composed_langscript: composedText.trim() });
  } catch (error) {
    console.error('Proxy Error (/api/compose):', error);
    response.status(500).json({ error: 'Proxy server encountered an error.', details: error.message });
  }
};
