import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const port = 3000;

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
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

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
    const text = result?.response?.text?.() ? String(result.response.text()).trim() : "";
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

app.get("/health", (req, res) => {
  res.json({ status: "ok", gemini: !!process.env.GEMINI_API_KEY });
});

// ✅ Start
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});