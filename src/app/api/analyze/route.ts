import {NextResponse} from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
    try {
         const {language, code} = await request.json();
         const apiKey = process.env.GEMINI_API_KEY;
         if(!apiKey) {
            return NextResponse.json({error: 'Google API key is not set'}, {status: 500});
         }
        const ai = new GoogleGenerativeAI(apiKey);
        const model = ai.getGenerativeModel({
            model : 'gemini-2.5-flash' ,
            generationConfig : {
            responseMimeType : 'application/json',
            }
        });
        const prompt = `
            Analyze this ${language} code.
            Return strictly valid JSON using this exact schema:
            {
                "time_complexity": "O(...)",
                "space_complexity": "O(...)",
                "explanation": "Brief technical reason.",
                "optimization": "One short tip to improve."
            }
            Code:
            ${code}
            `;
        const result = await model.generateContent(prompt);
        return NextResponse.json(JSON.parse(result.response.text()));    

    } catch (error) {
        return NextResponse.json({error: 'Analysis failed'} , {status: 500});
    }
}

