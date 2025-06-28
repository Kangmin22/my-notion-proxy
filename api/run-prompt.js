// api/run-prompt.js
const { head, download } = require('@vercel/blob');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = async (request, response) => {
    if (request.method !== 'POST') return response.status(405).send('Method Not Allowed');
    try {
        const { prompt_url, user_input } = request.body;
        if (!prompt_url || !user_input) throw new Error('prompt_url and user_input are required.');

        const blob = await head(prompt_url);
        if (!blob) return response.status(404).json({ error: 'Prompt file not found.' });
        
        const promptContent = await (await download(prompt_url)).text();
        const finalPrompt = `${promptContent}\n\n--- User Input ---\n\n${user_input}`;

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
        const result = await model.generateContent(finalPrompt);
        const aiResponse = await result.response;
        const text = aiResponse.text();

        response.status(200).json({ result: text });
    } catch (error) {
        console.error("Run Prompt Error:", error);
        response.status(500).json({ error: 'Failed to execute prompt.', details: error.message });
    }
};
