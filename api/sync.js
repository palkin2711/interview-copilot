function redisConfig() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  };
}

function roomKey(value) {
  const room = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return room.length >= 4 ? `interview-room:${room}` : "";
}

async function command(config, body) {
  const response = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "Live sync failed.");
  return data.result;
}

export default async function handler(req, res) {
  const config = redisConfig();
  if (!config.url || !config.token) {
    return res.status(503).json({ error: "Live sync storage is not connected in Vercel." });
  }
  const key = roomKey(req.method === "GET" ? req.query?.room : req.body?.room);
  if (!key) return res.status(400).json({ error: "Enter a room code containing 4 to 8 letters or numbers." });
  try {
    if (req.method === "GET") {
      const raw = await command(config, ["GET", key]);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(raw ? JSON.parse(raw) : null);
    }
    if (req.method === "POST") {
      const payload = {
        question: String(req.body?.question || "").slice(0, 2500),
        answer: String(req.body?.answer || "").slice(0, 3000),
        status: String(req.body?.status || "Listening").slice(0, 100),
        updatedAt: Date.now()
      };
      await command(config, ["SET", key, JSON.stringify(payload), "EX", "10800"]);
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Use GET or POST." });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Live sync failed." });
  }
}
