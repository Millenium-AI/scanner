import { Router } from "express";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/identify-card", upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image provided" });
    return;
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.2-11b-vision-instruct",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a trading card identifier. Look at this card image and respond with ONLY a JSON object, no other text:
{"name":"card name","set":"set name","number":"card number like 4/102","game":"Pokemon or One Piece","confidence":0.95}`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
            }
          }
        ]
      }]
    })
  });

  const data = await response.json();
  console.log("Raw response:", JSON.stringify(data, null, 2));

  if (!data.choices?.[0]) {
    res.status(500).json({ error: "Unexpected API response", raw: data });
    return;
  }

  const raw = data.choices[0].message.content.trim();
  // Extract JSON even if there's surrounding text
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    res.status(500).json({ error: "Could not parse card data", raw });
    return;
  }

  const card = JSON.parse(jsonMatch[0]);
  res.json(card);
});

export default router;