import fs from 'fs';

const tones = [
  "Angry", "Polite", "Technical", "Confused", "Urgent", 
  "Sarcastic", "Frustrated", "Brief", "Descriptive", "Threatening",
  "Furious", "Formal", "Alarmed", "Demanding", "Analytical",
  "Puzzled", "Immediate", "Cynical", "Annoyed", "Legalistic"
];

const scenarios = [
  "QR code scan timeout",
  "Money deducted but no credits shown",
  "App crashed during payment",
  "Duplicate charge",
  "Wrong amount deducted",
  "Network timeout",
  "Machine didn't unlock",
  "No receipt generated",
  "Coin slot jammed",
  "Connection lost"
];

const dataset = [];

for (let i = 0; i < 50; i++) {
  const tone = tones[i % tones.length];
  const scenario = scenarios[i % scenarios.length];
  const amount = Math.floor(Math.random() * 5000) + 500;
  
  let content = "";
  let category = "";
  let action = "";

  if (tone === "Angry" || tone === "Furious" || tone === "Threatening") {
    content = `This is robbery! I paid ${amount} TZS and your machine failed with ${scenario}! FIX IT OR REFUND NOW!`;
    category = "CRITICAL_FAILURE";
    action = "MANUAL_REFUND_REQUIRED";
  } else if (tone === "Technical" || tone === "Analytical") {
    content = `Log entry: ${scenario} triggered 503 error after M-Pesa push for ${amount} TZS. Check transaction sync.`;
    category = "API_ERROR";
    action = "LOG_INSPECTION";
  } else if (tone === "Confused" || tone === "Puzzled") {
    content = `I'm not sure what happened... it says ${scenario} but my phone says I paid ${amount}. What's next?`;
    category = "USER_GUIDANCE";
    action = "SEND_TUTORIAL";
  } else {
    content = `Hello, encountered ${scenario} for ${amount} TZS. Please assist.`;
    category = "SUPPORT_REQUEST";
    action = "TICKET_CREATED";
  }

  dataset.push({
    messages: [
      { role: "system", content: "You are the B-ht SmartKiosk Support Assistant. Categorize and suggest actions for payment failures." },
      { role: "user", content: content },
      { role: "assistant", content: JSON.stringify({ category, tone, amount, suggested_action: action }) }
    ]
  });
}

fs.writeFileSync('B-ht/support_finetune_v1.jsonl', dataset.map(d => JSON.stringify(d)).join('\n'));
console.log("Full 50-item finetuning dataset generated at B-ht/support_finetune_v1.jsonl");
