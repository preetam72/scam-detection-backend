import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
console.log('GEMINI_API_KEY found:', !!apiKey);
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

try {
  const result = await model.generateContent('Hello world');
  console.log('RESULT', result);
} catch (err) {
  console.error('ERROR TYPE', err?.constructor?.name);
  console.error('ERROR MESSAGE', err?.message);
  console.error('ERROR DETAILS', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
  if (err.response) console.error('RESPONSE', JSON.stringify(err.response, Object.getOwnPropertyNames(err.response), 2));
  process.exit(1);
}
