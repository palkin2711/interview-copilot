const DEFAULT_MODEL = "gemini-2.5-flash";

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
- Write in first person, natural spoken English.
- Use simple vocabulary suitable for a non-native English speaker.
- Return only the answer, with no heading, disclaimer, quotation marks, or coaching notes.
- Keep it between 45 and 85 words, normally 3 to 5 short sentences.
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
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(req.body || {}) }] }],
        generationConfig: {
          temperature: 0.35,
          topP: 0.9,
          maxOutputTokens: 220
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || "Gemini request failed.";
      return res.status(response.status).json({ error: message });
    }

    const answer = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("\n")
      .trim();

    if (!answer) {
      return res.status(502).json({ error: "No answer was returned. Please try again." });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ answer });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
}
