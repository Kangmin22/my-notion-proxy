// api/compose.js
export default async function handler(request, response) {
  try {
    const pageIds = request.body.page_ids; // 페이지 ID '리스트'를 받습니다.
    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
      return response.status(400).json({ error: 'Proxy Error: page_ids array is missing or empty.' });
    }

    const { headers } = request;
    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };

    // 각 페이지 ID에 대해 API 호출을 준비합니다. (Promise.all로 병렬 처리)
    const fetchPromises = pageIds.map(pageId => {
      const notionApiUrl = `https://api.notion.com/v1/blocks/${pageId}/children`;
      return fetch(notionApiUrl, { method: 'GET', headers: notionHeaders });
    });

    // 모든 API 호출이 끝날 때까지 기다립니다.
    const responses = await Promise.all(fetchPromises);

    // 각 응답을 JSON으로 변환합니다.
    const jsonPromises = responses.map(res => {
      if (!res.ok) {
        // 하나라도 실패하면 에러를 던집니다.
        throw new Error(`Notion API Error: ${res.status}`);
      }
      return res.json();
    });
    
    const results = await Promise.all(jsonPromises);

    // 각 페이지의 블록 내용을 하나의 텍스트로 조합합니다.
    let composedText = '';
    results.forEach((pageResult, index) => {
      composedText += `\n\n# --- Module ${index + 1} Content ---\n`;
      pageResult.results.forEach(block => {
        if (block.type === 'paragraph' && block.paragraph.rich_text.length > 0) {
          composedText += block.paragraph.rich_text.map(t => t.plain_text).join('') + '\n';
        }
        // 다른 블록 타입(heading, bulleted_list_item 등)도 필요에 따라 추가할 수 있습니다.
      });
    });

    // 조합된 텍스트를 GPT에게 돌려줍니다.
    response.status(200).json({ composed_langscript: composedText.trim() });

  } catch (error) {
    console.error('Detailed proxy error:', error);
    response.status(500).json({ error: 'Proxy server encountered an error.', details: error.message });
  }
}
