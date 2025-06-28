// api/list-prompts.js
const { list } = require('@vercel/blob');

module.exports = async (request, response) => {
    if (request.method !== 'GET') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Vercel Blob에서 모든 파일 목록을 가져옵니다.
        const { blobs } = await list();

        // 'prompts/' 경로에 있는 파일만 필터링합니다.
        const promptFiles = blobs.filter(blob => blob.pathname.startsWith('prompts/'));

        response.status(200).json({ 
            message: `Found ${promptFiles.length} prompt files.`,
            prompts: promptFiles 
        });

    } catch (error) {
        console.error("List Prompts Error:", error);
        response.status(500).json({ error: 'Failed to list prompts.', details: error.message });
    }
};
