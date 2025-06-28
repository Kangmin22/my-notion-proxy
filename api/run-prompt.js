// api/run-prompt.js
const { head } = require('@vercel/blob');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 메타데이터와 본문을 분리하는 헬퍼 함수
function parsePrompt(rawContent) {
    const parts = rawContent.split('---');
    if (parts.length < 3) {
        // 메타데이터가 없는 경우, 기본적으로 ai_generation으로 처리
        return { metadata: { execution_mode: 'ai_generation' }, body: rawContent };
    }
    const metadata = require('js-yaml').load(parts[1]);
    const body = parts.slice(2).join('---').trim();
    return { metadata, body };
}

// 템플릿을 사용자 입력으로 채우는 헬퍼 함수
function populateTemplate(template, userInput) {
    let populated = template;
    for (const key in userInput) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        populated = populated.replace(regex, userInput[key]);
    }
    return populated;
}

module.exports = async (request, response) => {
    try {
        const { prompt_url, user_input } = request.body;
        if (!prompt_url || !user_input) {
            throw new Error('prompt_url and user_input are required.');
        }

        const blob = await head(prompt_url);
        if (!blob) {
            return response.status(404).json({ error: 'Prompt file not found.' });
        }
        
        const rawContent = await (await fetch(prompt_url)).text();
        const { metadata, body: promptTemplate } = parsePrompt(rawContent);

        let finalResult;

        console.log(`Executing in mode: ${metadata.execution_mode}`);

        if (metadata.execution_mode === 'simple_template') {
            // --- 단순 템플릿 모드 ---
            // 외부 AI 호출 없이, 텍스트를 직접 치환합니다.
            finalResult = populateTemplate(promptTemplate, user_input);

        } else if (metadata.execution_mode === 'ai_generation') {
            // --- AI 생성 모드 ---
            const finalPrompt = populateTemplate(promptTemplate, user_input);
            const modelName = metadata.model || "gemini-1.5-pro-latest";
            const model = genAI.getGenerativeModel({ model: modelName });
            
            const result = await model.generateContent(finalPrompt);
            const aiResponse = await result.response;
            finalResult = aiResponse.text();

        } else {
            throw new Error(`Unknown execution_mode: ${metadata.execution_mode}`);
        }

        response.status(200).json({ result: finalResult });

    } catch (error) {
        console.error("Run Prompt Error:", error);
        response.status(500).json({ error: 'Failed to execute prompt.', details: error.message });
    }
};
