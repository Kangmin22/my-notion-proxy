// api/retrieveByName.js
export default async function handler(request, response) {
  try {
    const promptName = request.body.prompt_name;
    const databaseId = "21d33048babe80d09d09e923f6e99c54"; // ID는 하드코딩

    if (!promptName) {
      return response.status(400).json({ error: 'Proxy Error: prompt_name is missing.' });
    }

    const { headers } = request;
    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };

    // 1단계: 이름으로 페이지 ID를 찾기 위해 노션 DB 쿼리
    const queryUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
    const queryBody = {
      filter: {
        property: "Prompt Name",
        title: {
          equals: promptName,
        },
      },
    };

    const queryResponse = await fetch(queryUrl, {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify(queryBody),
    });

    if (!queryResponse.ok) {
      throw new Error(`Notion Query API Error: ${queryResponse.status}`);
    }

    const queryData = await queryResponse.json();
    if (queryData.results.length === 0) {
      return response.status(404).json({ error: `Prompt with name '${promptName}' not found.` });
    }
    
    const pageId = queryData.results[0].id;

    // 2단계: 찾은 페이지 ID로 본문 내용 조회
    const retrieveUrl = `https://api.notion.com/v1/blocks/${pageId}/children`;
    const retrieveResponse = await fetch(retrieveUrl, {
      method: 'GET',
      headers: notionHeaders,
    });

    if (!retrieveResponse.ok) {
      throw new Error(`Notion Retrieve API Error: ${retrieveResponse.status}`);
    }

    const retrieveData = await retrieveResponse.json();
    response.status(200).json(retrieveData);

  } catch (error) {
    console.error('Detailed proxy error:', error);
    response.status(500).json({ error: 'Proxy server encountered an error.', details: error.message });
  }
}
