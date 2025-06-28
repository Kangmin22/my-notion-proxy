// api/get-prompt.js
const { head } = require('@vercel/blob');

module.exports = async (request, response) => {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { prompt_url } = request.body;
        if (!prompt_url) {
            throw new Error('prompt_url is required.');
        }

        // 먼저 파일이 존재하는지 확인
        const blob = await head(prompt_url);
        if (!blob) {
            return response.status(404).json({ error: 'Prompt file not found.' });
        }

        // ✅ 수정된 부분: download 대신 fetch 사용
        const content = await (await fetch(prompt_url)).text();

        response.status(200).json({ content });

    } catch (error) {
        console.error("Get Prompt Error:", error);
        response.status(500).json({ error: 'Failed to get prompt content.', details: error.message });
    }
};
