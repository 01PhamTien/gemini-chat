const express = require("express");
const path = require("node:path");

const app = express();

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/chat", async (req, res) => {
  const key = process.env.ROUTER_API_KEY?.trim();
  const model = process.env.ROUTER_MODEL
    ?.trim()
    .replace(/^gemini\//, "");

  if (!key || !model) {
    return res.status(500).json({
      error: "Thiếu ROUTER_API_KEY hoặc ROUTER_MODEL trên Vercel."
    });
  }

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
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
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
        signal: AbortSignal.timeout(50000)
      }
    );

    const raw = await response.text();
    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `Google trả về dữ liệu không hợp lệ (HTTP ${response.status}).`
      );
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: response.status === 429
          ? "Model Gemini hết hoặc chưa có quota. Kiểm tra hạn mức Google AI Studio."
          : data.error?.message || `Google báo lỗi HTTP ${response.status}.`
      });
    }

    const reply = data.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error("Gemini chưa trả về nội dung văn bản.");
    }

    return res.json({ reply });
  } catch (error) {
    console.error(error.message);

    return res.status(502).json({
      error: error.message === "fetch failed"
        ? "Không kết nối được API Google Gemini."
        : error.name === "TimeoutError"
          ? "Gemini phản hồi quá lâu. Bạn thử lại nhé."
          : error.message
    });
  }
});

// Chạy trên máy khi mở trực tiếp file này.
if (require.main === module) {
  app.listen(3000, "127.0.0.1", () => {
    console.log("Website: http://127.0.0.1:3000");
  });
}

// Cho Vercel sử dụng.
module.exports = app;