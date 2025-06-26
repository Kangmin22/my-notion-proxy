const { createClient } = require('@vercel/kv');

let kv;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

module.exports = async (req, res) => {
  const notionHeaders = {
    'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  };

  const databaseId = "21d33048babe80d09d09e923f6e99c54";
  const yamlBlock = {
    object: 'block',
    type: 'code',
    code: {
      rich_text: [{ type: 'text', text: { content: `goal: ""\nsteps:\n  - function: getTextFromInput\n  - function: logOutput` } }],
      language: 'yaml'
    }
  };

  try {
    // 1. 전체 페이지 조회
    let pages = await kv.get('notion_modules_cache');
if (typeof pages === 'string') {
  pages = JSON.parse(pages);
}

    let resetCount = 0;

    for (const module of pages) {
      const page_id = module.page_id;

      // 2. 블록 전체 조회
      const blockRes = await fetch(`https://api.notion.com/v1/blocks/${page_id}/children`, {
        method: 'GET',
        headers: notionHeaders
      });

      const blockData = await blockRes.json();
      const blockIds = blockData.results?.map(b => b.id) || [];

      // 3. 블록 삭제
      for (const bid of blockIds) {
        await fetch(`https://api.notion.com/v1/blocks/${bid}`, {
          method: 'DELETE',
          headers: notionHeaders
        });
      }

      // 4. 빈 YAML 블록 삽입
      await fetch(`https://api.notion.com/v1/blocks/${page_id}/children`, {
        method: 'PATCH',
        headers: notionHeaders,
        body: JSON.stringify({ children: [yamlBlock] })
      });

      resetCount++;
    }

    res.status(200).json({ message: `초기화 완료. ${resetCount}개 페이지에 YAML 재삽입.` });

  } catch (e) {
    console.error("Reset Error:", e);
    res.status(500).json({ error: '전체 초기화 실패', details: e.message });
  }
};
