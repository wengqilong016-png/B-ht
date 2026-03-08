const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env.local") });

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY || "");
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.VITE_GEMINI_API_KEY}`);
    const data = await response.json();
    console.log("Available Models:");
    data.models.forEach(m => console.log(m.name));
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

listModels();
