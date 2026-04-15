import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const port = 3000;

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));
app.use(express.json());

console.log("GEMINI_API_KEY loaded:", !!process.env.GEMINI_API_KEY);

// ✅ Check API key
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing in .env");
  process.exit(1);
}

// ✅ Gemini setup — auto-fallback across models (no retries, just tries the next)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];

// ✅ Scam detection — always uses real user input, no hardcoded responses
const detectScam = async (message) => {
  const normalizedMessage = String(message || "").trim();

  if (!normalizedMessage) {
    return `Scam Probability: 0%
Risk Level: Low
Scam Type: Safe
Explanation: No message content was provided to analyze.
Indicators:
- Empty input received
- No content to evaluate
- Unable to perform analysis`;
  }

  console.log("🔎 Detecting scam for message:", normalizedMessage.slice(0, 120));

  const prompt = `You are an advanced cybersecurity scam detection AI.

Analyze the following user-submitted message and determine whether it is spam, a scam, phishing, or legitimate.

You MUST return your response STRICTLY in this exact format with no extra text before or after:

Scam Probability: <number between 0 and 100>%
Risk Level: <Low / Medium / High>
Scam Type: <Phishing / OTP Scam / Lottery Scam / Investment Scam / Delivery Scam / Tech Support Scam / Bank Impersonation / Social Engineering / Safe>
Explanation: <clear 1-2 sentence reason based on the actual message content>
Indicators:
- <specific indicator found in the message>
- <specific indicator found in the message>
- <specific indicator found in the message>

Rules:
- Base your analysis ONLY on the actual message content below
- Different messages MUST produce different scores and assessments
- A normal greeting like "hello" or "how are you" should score very low (0-10%)
- Messages with urgency, suspicious links, requests for personal info should score high (70-100%)
- Be specific in your explanation — reference actual phrases from the message

Message to analyze:
"""
${normalizedMessage}
"""`;

  // Try each model once — first success wins
  for (const modelName of MODELS) {
    try {
      console.log(`🤖 Trying: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result?.response?.text?.() ? String(result.response.text()).trim() : "";
      if (text) {
        console.log(`✅ Success with ${modelName}`);
        return text;
      }
    } catch (err) {
      console.warn(`⚠️ ${modelName}: ${err?.message?.slice(0, 80)}`);
    }
  }

  throw new Error("All AI models are currently unavailable. Please try again in a moment.");
};

// ✅ Route
app.post("/scan", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        result: "Scam Probability: 0%\nRisk Level: Error\nScam Type: Error\nExplanation: No message provided\nIndicators:\n- Empty input",
      });
    }

    console.log("📨 Received message to scan:", String(message).slice(0, 100));
    const result = await detectScam(message);
    console.log("✅ Scan complete");
    return res.json({ result });
  } catch (error) {
    console.error("❌ Server/AI Error:", error?.message || error);

    return res.status(500).json({
      result: `Scam Probability: 0%\nRisk Level: Error\nScam Type: Error\nExplanation: AI engine error — ${error?.message || "Unknown error"}\nIndicators:\n- ${error?.message || "Internal server error"}`,
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", gemini: !!process.env.GEMINI_API_KEY });
});

// ✅ Start
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});