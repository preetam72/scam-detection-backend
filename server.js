import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

console.log("GEMINI_API_KEY loaded:", !!process.env.GEMINI_API_KEY);

// ✅ Check API key
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing in .env");
  process.exit(1);
}

// ✅ Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const chatModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  systemInstruction: "You are ScamShield Assistant, a friendly and expert cybersecurity agent. Your goal is to help users identify potential scams, answer questions about online safety, explain how common frauds (like phishing, investment scams, and OTP theft) work, and provide advice on what to do if they've been scammed. Be concise, reassuring, and highly informative. Keep answers clear, professional, and use bullet points where helpful. If the user provides a message, email, or link and asks if it is a scam, you should analyze it carefully and give an estimated risk level (Low, Medium, High) along with your reasons."
});

// ✅ Scam detection
const detectScam = async (message) => {
  const normalizeMessage = String(message || "").trim();
  const lowerText = normalizeMessage.toLowerCase();

  const buildFallbackResponse = () => {
    const suspiciousKeywords = ["urgent", "click", "verify", "otp", "lottery"];
    const matchedKeywords = suspiciousKeywords.filter((keyword) => lowerText.includes(keyword));

    if (matchedKeywords.length > 0) {
      return `Scam Probability: 85%
Risk Level: High
Scam Type: Phishing
Explanation: Suspicious keywords detected in the message.
Indicators:
- Contains ${matchedKeywords.join(", ")}
- Urgent or action-oriented wording
- Possible phishing attempt`;
    }

    return `Scam Probability: 20%
Risk Level: Low
Scam Type: Safe
Explanation: No strong scam keywords found.
Indicators:
- No urgent or suspicious triggers
- Message appears low-risk
- Monitor content cautiously`;
  };

  if (!normalizeMessage) {
    return `Scam Probability: 20%
Risk Level: Low
Scam Type: Safe
Explanation: No message content provided.
Indicators:
- Empty input
- No suspicious keywords
- Nothing to analyze`;
  }

  try {
    console.log("🔎 Detecting scam for message:", normalizeMessage.slice(0, 120));

    const prompt = `
You are an advanced cybersecurity scam detection AI.

Analyze the message and return STRICTLY in this format:

Scam Probability: <number>%
Risk Level: <Low / Medium / High>
Scam Type: <Phishing / OTP Scam / Lottery / Investment Scam / Safe>
Explanation: <clear reason in 2 lines>
Indicators:
- <indicator 1>
- <indicator 2>
- <indicator 3>

Message:
${normalizeMessage}
`;

    const result = await model.generateContent(prompt);
    const text = result?.response?.text ? String(result.response.text()).trim() : "";

    if (!text) {
      console.warn("⚠️ Gemini returned empty response, using fallback.");
      return buildFallbackResponse();
    }

    return text;
  } catch (error) {
    console.error("❌ Gemini Error:", error);
    if (error?.response) {
      console.error("❌ Gemini Error response:", error.response);
    }

    return buildFallbackResponse();
  }
};

// ✅ Route
app.post("/scan", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        result: "Scam Probability: 0%\nRisk Level: Error\nScam Type: Error\nExplanation: No message provided\nIndicators:\n- Empty input",
      });
    }

    const result = await detectScam(message);
    console.log("✅ Scan Result:", result);
    return res.json({ result });
  } catch (error) {
    console.error("❌ Server Error:", error);

    return res.status(500).json({
      result: "Scam Probability: 0%\nRisk Level: Error\nScam Type: Error\nExplanation: Server crashed\nIndicators:\n- Internal error",
    });
  }
});

// ✅ Chat route
app.post("/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const chatHistory = history || [];

    const formattedHistory = chatHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Gemini chat history MUST start with a 'user' message.
    while (formattedHistory.length > 0 && formattedHistory[0].role !== 'user') {
      formattedHistory.shift();
    }

    const chat = chatModel.startChat({
      history: formattedHistory
    });

    const result = await chat.sendMessage(message);
    const responseText = result.response.text();

    return res.json({ response: responseText });
  } catch (error) {
    console.error("❌ Chat Server Error:", error);
    return res.status(500).json({ error: "Internal server error occurred." });
  }
});

// ✅ Chat streaming route (Server-Sent Events)
app.post("/chat-stream", async (req, res) => {
  // Set headers for Server-Sent Events (SSE) streaming
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const { message, history, scanContext } = req.body;

    if (!message) {
      res.write(`data: ${JSON.stringify({ error: "Message is required" })}\n\n`);
      res.end();
      return;
    }

    const chatHistory = history || [];

    const formattedHistory = chatHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Gemini chat history MUST start with a 'user' message.
    while (formattedHistory.length > 0 && formattedHistory[0].role !== 'user') {
      formattedHistory.shift();
    }

    // Determine custom system instruction based on context
    let systemInstruction = "You are ScamShield Assistant, a friendly and expert cybersecurity agent. Your goal is to help users identify potential scams, answer questions about online safety, explain how common frauds (like phishing, investment scams, and OTP theft) work, and provide advice on what to do if they've been scammed. Be concise, reassuring, and highly informative. Keep answers clear, professional, and use bullet points where helpful. If the user provides a message, email, or link and asks if it is a scam, you should analyze it carefully and give an estimated risk level (Low, Medium, High) along with your reasons.";
    
    if (scanContext && scanContext.result) {
      const { content, result } = scanContext;
      systemInstruction += `\n\nCURRENT CONTEXT: The user is currently viewing a scan report for a message they scanned.
Scanned Message Text: "${content}"
Scan Report Details:
- Threat Probability: ${result.probability}%
- Risk Level: ${result.riskLevel}
- Scam Type: ${result.scamType || 'Unknown'}
- Analysis Summary: ${result.analysis || ''}
- Indicators Detected: ${result.indicators ? result.indicators.join(', ') : 'None'}

You should reference this scan report to answer any questions the user has about "this scan", "why is it a scam", or "what should I do next". Be highly specific to the context provided.`;
    }

    const activeChatModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction
    });

    const chat = activeChatModel.startChat({
      history: formattedHistory
    });

    const resultStream = await chat.sendMessageStream(message);

    for await (const chunk of resultStream.stream) {
      const chunkText = chunk.text();
      res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("❌ Chat Stream Server Error:", error);
    res.write(`data: ${JSON.stringify({ error: "Internal server error occurred." })}\n\n`);
    res.end();
  }
});

// ✅ Image Scan route (Multimodal)
app.post("/scan-image", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        result: "Scam Probability: 0%\nRisk Level: Error\nScam Type: Error\nExplanation: No image data provided\nIndicators:\n- Empty input",
      });
    }

    console.log("📸 Scanning uploaded screenshot...");

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType || "image/png"
      }
    };

    const prompt = `
You are an advanced cybersecurity scam detection AI.

Analyze this screenshot of a message, email, social media post, or website, and return STRICTLY in this format:

Scam Probability: <number>%
Risk Level: <Low / Medium / High>
Scam Type: <Phishing / OTP Scam / Lottery / Investment Scam / Safe>
Explanation: <clear reason in 2 lines>
Indicators:
- <indicator 1>
- <indicator 2>
- <indicator 3>
`;

    const result = await model.generateContent([prompt, imagePart]);
    const resultText = result?.response?.text ? String(result.response.text()).trim() : "";

    if (!resultText) {
      console.warn("⚠️ Gemini returned empty response for image scan.");
      return res.status(500).json({
        result: "Scam Probability: 0%\nRisk Level: Error\nScam Type: Error\nExplanation: Analysis failed\nIndicators:\n- Internal AI error",
      });
    }

    console.log("✅ Image Scan Result:", resultText);
    return res.json({ result: resultText });
  } catch (error) {
    console.error("❌ Image Scan Server Error:", error);
    return res.status(500).json({
      result: "Scam Probability: 0%\nRisk Level: Error\nScam Type: Error\nExplanation: Server crashed analyzing image\nIndicators:\n- Internal server error",
    });
  }
});

// ✅ Generate Scenario route (Structured JSON Mode)
app.get("/generate-scenario", async (req, res) => {
  try {
    console.log("🎮 Generating dynamic training scenario...");

    const prompt = `
You are a cybersecurity training system. Generate one randomized, highly realistic communication scenario.
The scenario can either be a scam attempt (Phishing, Vishing, OTP scam, Lottery, Investment scam, Fake package tracking) OR a safe, legitimate message (Real bank OTP, transaction alert, delivery updates, family message, official newsletter).

Return STRICTLY in this JSON format:
{
  "type": "SMS" or "Email" or "Voice Call Transcript",
  "content": "<the generated scenario message content>",
  "isScam": true or false,
  "scamType": "<Safe if legitimate, otherwise the type of scam>",
  "explanation": "<explain in 1 line why it is safe or a scam>",
  "redFlags": ["<first key flag to look out for>", "<second key flag>"]
}
`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 1.0
      }
    });

    const resultText = result?.response?.text ? String(result.response.text()).trim() : "";

    if (!resultText) {
      throw new Error("Gemini returned empty response for scenario generation.");
    }

    const parsedData = JSON.parse(resultText);
    console.log("✅ Generated Scenario:", parsedData.scamType);
    return res.json(parsedData);
  } catch (error) {
    console.error("❌ Scenario Generation Error:", error);
    return res.status(500).json({ error: "Failed to generate training scenario." });
  }
});

// ✅ Extract report details from raw text (Structured JSON Mode)
app.post("/extract-report", async (req, res) => {
  try {
    const { rawText } = req.body;

    if (!rawText) {
      return res.status(400).json({ error: "Text is required to extract details." });
    }

    console.log("🔍 Extracting details from raw report payload...");

    const prompt = `
Analyze this raw scam message/email text and extract reporting details.
Determine:
1. The platform context (Select strictly from: "SMS / Text Message", "Email", "Website / URL", "Social Media").
2. The priority (Select strictly from: "Low", "Medium", "High", "Critical").
3. The malicious link or URL, if present.
4. The cleaned message or content.

Return STRICTLY in this JSON format:
{
  "platform": "<one of the selected platforms>",
  "priority": "<one of the selected priorities>",
  "link": "<url or empty>",
  "message": "<cleaned content of the message>"
}

Raw text:
${rawText}
`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const resultText = result?.response?.text ? String(result.response.text()).trim() : "";

    if (!resultText) {
      throw new Error("Gemini returned empty response for extraction.");
    }

    const parsedData = JSON.parse(resultText);
    console.log("✅ Extracted Reporting Details:", parsedData.platform);
    return res.json(parsedData);
  } catch (error) {
    console.error("❌ Extraction Server Error:", error);
    return res.status(500).json({ error: "Failed to extract scam details." });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", gemini: !!process.env.GEMINI_API_KEY });
});

// ✅ Start
if (process.env.NODE_ENV !== "production" || process.env.PORT || process.env.RENDER) {
  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
  });
}

export default app;