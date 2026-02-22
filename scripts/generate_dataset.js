import fs from 'fs';

const tones = [
  "Angry", "Furious", "Raging", "Impatient", "Demanding",
  "Polite", "Respectful", "Patient", "Grateful", "Apologetic",
  "Technical", "Analytical", "Precise", "Formal", "Professional",
  "Confused", "Puzzled", "Uncertain", "Lost", "Vague",
  "Urgent", "Panicked", "Immediate", "Desperate", "Alarmed",
  "Sarcastic", "Cynical", "Mocking", "Ironical", "Passive-Aggressive",
  "Frustrated", "Annoyed", "Disappointed", "Exhausted", "Fed up",
  "Brief", "Concise", "Short", "Direct", "Minimalist",
  "Descriptive", "Elaborate", "Detailed", "Narrative", "Circumstantial",
  "Threatening", "Legalistic", "Intimidating", "Stern", "Aggressive"
];

const scenarios = [
  "QR code scan timeout",
  "Money deducted but no credits shown on machine",
  "App crashed during transaction processing",
  "Duplicate charge for a single session",
  "Wrong amount deducted from wallet",
  "Network timeout after payment confirmation",
  "Payment successful but machine didn't unlock",
  "No receipt generated after successful payment",
  "Coin slot jammed during credit update",
  "Connection lost between app and kiosk"
];

const dataset = [];

for (let i = 0; i < 50; i++) {
  const tone = tones[i % tones.length];
  const scenario = scenarios[i % scenarios.length];
  const ticketId = `SK-${20260200 + i}`;
  const amount = Math.floor(Math.random() * 5000) + 500;
  
  let message = "";
  switch(tone) {
    case "Angry": message = `WTF! Your machine just stole my ${amount} TZS! Give it back NOW!`; break;
    case "Furious": message = `This is robbery! I paid for ${scenario} and got nothing! I want my money back immediately!`; break;
    case "Raging": message = `I am tired of this broken app! ${amount} TZS gone for nothing! Fix your ${scenario}!`; break;
    case "Impatient": message = `Hurry up and fix this. I paid and the machine is stuck on ${scenario}. My time is money!`; break;
    case "Demanding": message = `Refund my ${amount} TZS immediately. The ${scenario} failed and I won't wait.`; break;
    case "Polite": message = `Excuse me, I encountered an issue with ${scenario}. Could you please check my transaction?`; break;
    case "Respectful": message = `Dear Support, I believe there was an error during my payment of ${amount} TZS. Thank you for your help.`; break;
    case "Patient": message = `Hello, I'm waiting at the kiosk and it seems ${scenario} happened. No rush, but please look into it.`; break;
    case "Grateful": message = `Thanks for the app, but ${scenario} just occurred. I'm sure you can fix it. ${amount} TZS was deducted.`; break;
    case "Apologetic": message = `Sorry to bother, I might have done something wrong but the ${scenario} failed after payment.`; break;
    case "Technical": message = `Observed a 408 Timeout during ${scenario}. Transaction state is 'pending' but debit confirmed.`; break;
    case "Analytical": message = `The logs indicate ${scenario} at 14:00. Sync failed between Supabase and the local machine.`; break;
    case "Precise": message = `Transaction ID SK-${i} failed. Amount: ${amount}. Reason: ${scenario}. Lat/Long confirmed.`; break;
    case "Formal": message = `I am writing to report a discrepancy regarding ${scenario}. Please find the attached details.`; break;
    case "Professional": message = `A payment failure was detected at Location ${i}. Issue: ${scenario}. Please escalate.`; break;
    case "Confused": message = `I'm not sure what happened... I paid but the machine says ${scenario}? What do I do?`; break;
    case "Puzzled": message = `Wait, the money is gone but the screen is blank? Is ${scenario} a common thing?`; break;
    case "Uncertain": message = `Maybe I scanned it wrong? It says ${scenario} but my bank says paid. Help?`; break;
    case "Lost": message = `I'm stuck here. Paid ${amount} and it just shows ${scenario}. Is anyone there?`; break;
    case "Vague": message = `It didn't work. Something about ${scenario}. Sort it out.`; break;
    case "Urgent": message = `CRITICAL: Payment failed during ${scenario}! I need this machine working NOW!`; break;
    case "Panicked": message = `Oh no! My last ${amount} TZS is gone and the machine is broken! Please help me!`; break;
    case "Immediate": message = `Process this refund NOW. ${scenario} blocked my transaction.`; break;
    case "Desperate": message = `I really need those credits. Paid ${amount} but ${scenario} happened. Please, I'm begging.`; break;
    case "Alarmed": message = `Wait! Why did it charge me twice for ${scenario}?! Stop the payment!`; break;
    case "Sarcastic": message = `Wow, great job. Stole my money and gave me ${scenario} instead of credits. Amazing.`; break;
    case "Cynical": message = `Another day, another ${scenario}. I guess this is how you make your profit?`; break;
    case "Mocking": message = `Is this a "Smart" kiosk or a "Stupid" one? Because ${scenario} isn't very smart.`; break;
    case "Ironical": message = `How ironic. The "Reliable" app just failed with ${scenario} on my first try.`; break;
    case "Passive-Aggressive": message = `It's fine, I didn't need that ${amount} TZS anyway. I'm sure ${scenario} is a feature.`; break;
    case "Frustrated": message = `Ugh! Not again! ${scenario} is ruining my day. Just fix it!`; break;
    case "Annoyed": message = `This is so annoying. Every time I use this, ${scenario} happens.`; break;
    case "Disappointed": message = `I expected better. Paid ${amount} and was met with ${scenario}. Sad.`; break;
    case "Exhausted": message = `I'm tired of calling support for ${scenario}. Just make the app work.`; break;
    case "Fed up": message = `I'm done with this. ${scenario} every single time. Give me my money back.`; break;
    case "Brief": message = `Paid ${amount}. ${scenario}. Refund.`; break;
    case "Concise": message = `Payment failed at ${scenario}. Transaction ${ticketId}. Fix.`; break;
    case "Short": message = `${scenario} error. Money gone. Help.`; break;
    case "Direct": message = `My payment of ${amount} failed due to ${scenario}. Refund required.`; break;
    case "Minimalist": message = `${scenario}. Fail. ${amount}.`; break;
    case "Descriptive": message = `I arrived at the kiosk, scanned the code, confirmed the ${amount} TZS payment on my phone, but then the screen just hung on ${scenario}.`; break;
    case "Elaborate": message = `After a long day, I tried to use the machine. The QR code loaded slowly, I paid, and then instead of credits, a ${scenario} message appeared.`; break;
    case "Detailed": message = `Location: Dar Central. Time: 15:30. Amount: ${amount}. Issue: ${scenario} after M-Pesa confirmation.`; break;
    case "Narrative": message = `So I was standing there, the sun was hot, and I just wanted to use the machine. I paid, but then ${scenario} happened and now I'm here.`; break;
    case "Circumstantial": message = `Given the low signal at this spot, it seems ${scenario} occurred during the callback phase of my ${amount} payment.`; break;
    case "Threatening": message = `Refund me now or I'm taking this to the police. This is fraud. ${scenario} is a lie.`; break;
    case "Legalistic": message = `Pursuant to the consumer rights act, I demand an immediate reversal of the ${amount} TZS charged during ${scenario}.`; break;
    case "Intimidating": message = `You don't want to mess with me. Give me my credits or my money. ${scenario} is your problem, not mine.`; break;
    case "Stern": message = `This failure is unacceptable. ${scenario} must be resolved immediately. No excuses.`; break;
    case "Aggressive": message = `Fix this ${scenario} SHIT right now or I'll break the machine!`; break;
    default: message = `Payment failed: ${scenario}`;
  }

  dataset.push({
    instruction: `Analyze the SmartKiosk user complaint and generate a structured support ticket. Tone: ${tone}`,
    input: message,
    output: JSON.stringify({
      ticket_id: ticketId,
      status: "failed",
      error_code: "SK_PAY_ERR_" + (i % 5 + 1).toString().padStart(3, '0'),
      location_id: `LOC_${100 + (i % 10)}`,
      amount_lost: amount,
      timestamp: new Date().toISOString(),
      user_tone: tone,
      ai_audit_status: "flagged",
      recommended_action: i % 5 === 0 ? "auto_refund" : "manual_review"
    }, null, 2)
  });
}

fs.writeFileSync('B-ht/payment_failure_dataset.json', JSON.stringify(dataset, null, 2));
console.log("Dataset generated successfully at B-ht/payment_failure_dataset.json");
