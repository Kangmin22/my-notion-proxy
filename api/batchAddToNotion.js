// /api/batchAddToNotion.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { modules } = req.body;
  if (!Array.isArray(modules)) {
    res.status(400).json({ error: "'modules' 필드는 배열이어야 합니다." });
    return;
  }

  const notionHeaders = {
    'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  };
  const databaseId = process.env.NOTION_DATABASE_ID;
  const results = [];

  for (const module of modules) {
    try {
      // API Rate Limit 방지: 1.1초 대기
      await new Promise(r => setTimeout(r, 1100));

      // 1. Notion 페이지 생성 (properties + children)
      const notionRes = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: notionHeaders,
        body: JSON.stringify({
          parent: { database_id: databaseId },
          properties: module.properties,
          children: module.children || []
        })
      });

      if (!notionRes.ok) {
        const err = await notionRes.json();
        results.push({ error: true, details: JSON.stringify(err) });
      } else {
        const data = await notionRes.json();
        results.push({ ok: true, page_id: data.id, name: module.properties["Prompt Name"]?.title?.[0]?.text?.content || "" });
      }
    } catch (err) {
      results.push({ error: true, details: err.message });
    }
  }

  res.status(200).json({ batch_result: results });
}
