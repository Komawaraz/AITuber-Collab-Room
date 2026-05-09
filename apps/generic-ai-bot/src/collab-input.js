export function buildGenericCollabInput(text) {
  const recent = extractLineValue(text, "Recent messages");
  const question = extractQuestion(text);
  if (!recent || recent === "none") {
    return {
      recent: "",
      question,
      prompt: question
    };
  }
  const prompt = [
    "AITuberコラボ部屋の文脈:",
    recent,
    "",
    "進行指示:",
    "直前の相手の発言や質問に先に具体的に反応してから、必要なら軽い問いを一つだけ返す。",
    "",
    "今回求められている返答:",
    question
  ].join("\n").trim();
  return {
    recent,
    question,
    prompt
  };
}

function extractQuestion(text) {
  const match = /(?:^|\n)Question:\s*(.+)\s*$/s.exec(text);
  return (match?.[1] || text).trim();
}

function extractLineValue(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}:\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Za-z ]+:|\\nQuestion:|$)`).exec(text);
  return (match?.[1] || "").trim();
}
