const DEFAULT_MODEL = "gemini-3.6-flash";

function clean(value, max) {
  return String(value || "").replace(/\0/g, "").trim().slice(0, max);
}

function buildPrompt(body) {
  const profile = clean(body.profile, 12000);
  const job = clean(body.jobDescription, 10000);
  const question = clean(body.question, 2500);
  const history = Array.isArray(body.history)
    ? body.history.slice(-4).map((item) => ({
        question: clean(item.question, 800),
        answer: clean(item.answer, 1200)
      }))
    : [];

  return `You are a real-time interview speaking coach. Generate a truthful speaking cue for the candidate.

STRICT RULES:
- Use only facts present in the candidate profile, resume, job description, or conversation history.
- Never invent clients, qualifications, numbers, tools, results, employers, or experience.
- If the profile lacks the requested fact, give an honest bridge answer explaining how the candidate would approach it.
- Write in first person, natural spoken English that sounds like a confident human candidate, not an AI or textbook.
- Use simple vocabulary suitable for a non-native English speaker.
- If the transcript is not a complete interview question, return exactly: WAIT
- Return only the answer, with no heading, disclaimer, quotation marks, or coaching notes.
- Give a complete interview-ready answer between 70 and 120 words, normally 5 to 8 natural sentences.
- Directly answer the question first, then briefly explain the approach or a truthful example, and finish with the result or takeaway.
- For behavioural or example questions, use a compact Situation–Action–Result flow without naming those headings.
- Never stop in the middle of a sentence. End with a complete final sentence.
- Start directly; do not repeat the question.

CANDIDATE PROFILE / RESUME:
${profile || "No candidate profile supplied."}

TARGET JOB DESCRIPTION:
${job || "No job description supplied."}

RECENT INTERVIEW CONTEXT:
${history.length ? JSON.stringify(history) : "None"}

INTERVIEWER QUESTION:
${question}`;
}

async function askGemini(url, prompt) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        topP: 0.9,
        maxOutputTokens: 700
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
      ]
    })
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || "Gemini request failed."), { status: response.status });
  const answer = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim();
  return { answer, finishReason: data?.candidates?.[0]?.finishReason || "" };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function askGeminiWithRetry(url, prompt) {
  const delays = [0, 250, 700];
  let lastError;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt]) await wait(delays[attempt]);
    try {
      return await askGemini(url, prompt);
    } catch (error) {
      lastError = error;
      const temporary = [429, 500, 502, 503, 504].includes(Number(error?.status)) || /high demand|temporar|overload|unavailable/i.test(error?.message || "");
      if (!temporary) throw error;
    }
  }
  throw lastError;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Gemini API key is not configured. Add GEMINI_API_KEY in Vercel Environment Variables."
    });
  }

  const question = clean(req.body?.question, 2500);
  if (question.length < 4) {
    return res.status(400).json({ error: "A complete question is required." });
  }

  const model = clean(process.env.GEMINI_MODEL, 80) || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const prompt = buildPrompt(req.body || {});
    let result = await askGeminiWithRetry(url, prompt);
    let answer = result.answer;

    const wordCount = String(answer || "").split(/\s+/).filter(Boolean).length;
    if (answer && answer.toUpperCase() !== "WAIT" && (wordCount < 40 || result.finishReason === "MAX_TOKENS")) {
      result = await askGeminiWithRetry(url, `${prompt}\n\nYour previous response was incomplete. Return one fresh, complete 70 to 120 word answer with 5 to 8 finished, natural sentences.`);
      answer = result.answer;
    }

    if (!answer) {
      return res.status(502).json({ error: "No answer was returned. Please try again." });
    }

    if (answer.trim().toUpperCase() === "WAIT") {
      return res.status(200).json({ answer: "", wait: true });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ answer });
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || "Unexpected server error." });
  }
}
