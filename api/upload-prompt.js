// api/upload-prompt.js
const { put } = require('@vercel/blob');
const { nanoid } = require('nanoid');

module.exports = async (request, response) => {
    if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');
    try {
        const { prompt_name, prompt_content } = request.body;
        if (!prompt_name || !prompt_content) throw new Error('prompt_name and prompt_content are required.');
        
        const pathname = `prompts/${prompt_name.replace(/\s/g, '-')}-${nanoid(6)}.txt`;
        const blob = await put(pathname, prompt_content, { access: 'public', contentType: 'text/plain; charset=utf-8' });
        
        response.status(201).json(blob);
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
};
