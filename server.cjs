const express = require("express");
const path = require("node:path");

const app = express();
const key = process.env.ROUTER_API_KEY;
const model = process.env.ROUTER_MODEL;

if (!key || !model) {
  console.error("Bạn chưa điền key hoặc model trong file .env");
  process.exit(1);
}

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/chat", async (req, res) => {
  const messages = req.body?.messages;

  if (
    !Array.isArray(messages) ||
    messages.length < 1 ||
    messages.length > 40 ||
    !messages.every(m =>
      m &&
      ["user", "assistant"].includes(m.role) &&
      typeof m.content === "string" &&
      m.content.length <= 12000
    )
  ) {
    return res.status(400).json({
      error: "Tin nhắn không hợp lệ hoặc quá dài."
    });
  }

  try {
    const response = await fetch(
      `${process.env.ROUTER_BASE_URL.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false
        }),
        signal: AbortSignal.timeout(120000)
      }
    );

    const raw = await response.text();
    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `9router trả về dữ liệu không hợp lệ (HTTP ${response.status}).`
      );
    }

    if (!response.ok) {
      const detail = data.error?.message || data.error;
      throw new Error(
        typeof detail === "string"
          ? detail
          : `9router báo lỗi HTTP ${response.status}`
      );
    }

    const reply = data.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error("Model chưa trả về câu trả lời bằng văn bản.");
    }

    res.json({ reply });
  } catch (error) {
    console.error(error.message);

    res.status(502).json({
      error: error.message === "fetch failed"
        ? "Không kết nối được 9router. Kiểm tra 9router còn chạy không."
        : error.message
    });
  }
});

module.exports = app;