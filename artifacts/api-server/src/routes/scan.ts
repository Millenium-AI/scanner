    import { Router } from "express";
import multer from "multer";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genai.getGenerativeModel({ model: "gemini-1.5-flash" });

router.post("/identify-card", upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image provided" });
    return;
  }

  const prompt = `Look at this trading card image. Extract the following and respond in JSON only, no extra text:
{
  "name": "card name",
  "set": "set name",
  "number": "card number like 4/102",
  "game": "Pokemon or One Piece",
  "confidence": 0.95
}
If you cannot read the card clearly, set confidence below 0.5.`;

  const imagePart = {
    inlineData: {
      data: req.file.buffer.toString("base64"),
      mimeType: req.file.mimetype,
    },
  };

  const result = await model.generateContent([prompt, imagePart]);
  const text = result.response.text().trim().replace(/```json|```/g, "");
  const card = JSON.parse(text);

  res.json(card);
});

export default router;