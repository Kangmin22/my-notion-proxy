// api/get-prompt.js
const { head, download } = require('@vercel/blob');

module.exports = async (request, response) => {
    if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');
    try {
        const { prompt_url } = request.body;
        if (!prompt_url) throw new Error('prompt_url is required.');

        const blob = await head(prompt_url);
        if (!blob) return response.status(404).json({ error: 'Prompt file not found.' });

        const content = await (await download(prompt_url)).text();
        response.status(200).json({ content });
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
};
