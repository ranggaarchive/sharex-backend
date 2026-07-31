const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { requireEnvelope } = require('../middleware/envelope');
const { authenticate } = require('../middleware/auth');

const API_BASE_URL = process.env.API_BASE_URL || 'https://zein.kitagih.com';

// ============================================
// CONFIG DATA — Canonical source of truth
// ============================================

const rulesData = require('../data/rules.json');

const servicesData = {
  SUPPORTED_SERVICES: {
    "netflix.com": "Netflix",
    "spotify.com": "Spotify",
    "open.spotify.com": "Spotify",
    "youtube.com": "YouTube",
    "music.youtube.com": "YouTube Music",
    "disneyplus.com": "Disney+",
    "hulu.com": "Hulu",
    "primevideo.com": "Prime Video",
    "play.hbomax.com": "HBO Max",
    "max.com": "HBO Max",
    "paramountplus.com": "Paramount+",
    "peacocktv.com": "Peacock",
    "iflix.com": "Iflix",
    "wetv.vip": "WeTV",
    "wetv.info": "WeTV",
    "iq.com": "iQiyi",
    "bilibili.com": "Bstation",
    "crunchyroll.com": "Crunchyroll",
    "mubi.com": "Mubi",
    "music.apple.com": "Apple Music",
    "tv.apple.com": "Apple TV",
    "epidemicsound.com": "Epidemic Sound",
    "musicbed.com": "Musicbed",
    "brain.fm": "Brain FM",
    "speechify.com": "Speechify",
    "chatgpt.com": "ChatGPT",
    "chat.openai.com": "ChatGPT",
    "deepseek.com": "Deepseek",
    "grok.com": "Grok",
    "perplexity.ai": "Perplexity",
    "beautiful.ai": "Beutfiul AI",
    "chutes.ai": "Chutes AI",
    "elicit.ai": "Elicit AI",
    "mermaid.ai": "Mermaid AI",
    "relume.io": "Relume AI",
    "hixbypass.com": "Hixbypass",
    "bypassgpt.ai": "BypassGPT",
    "turbo.ai": "Turbo AI",
    "duolingo.com": "Duolingo",
    "coursera.org": "Coursera",
    "udemy.com": "Udemy",
    "skillshare.com": "Skillshare",
    "masterclass.com": "MasterClass",
    "busuu.com": "Busuu",
    "quizlet.com": "Quizlet",
    "scholarcy.com": "Scholarcy",
    "educative.io": "Educative",
    "datacamp.com": "Datacamp",
    "curiosity.com": "Curiosity",
    "brilliant.org": "Brilliant",
    "academia.edu": "Academia",
    "studocu.com": "Studocu",
    "symbolab.com": "Symbolab",
    "slideshare.net": "Slideshare",
    "notion.so": "Notion",
    "figma.com": "Figma",
    "grammarly.com": "Grammarly",
    "clickup.com": "ClickUp",
    "coohom.com": "Coohom",
    "flaticon.com": "Flaticon",
    "iloveimg.com": "ILoveIMG",
    "ilovepdf.com": "ILovePDF",
    "rawpixel.com": "Rawpixel",
    "vectorizer.ai": "Vectorizer",
    "productioncrate.com": "ProductionCrate",
    "motionarray.com": "Motion Array",
    "svgator.com": "SVGator",
    "capcut.com": "Capcut",
    "pacdora.com": "Pacdora",
    "paperpal.com": "Paperpal",
    "prezi.com": "Prezi AI",
    "noteGPT.io": "NoteGPT",
    "everand.com": "Everand",
    "beinsports.com": "Bein Sports",
    "beIN SPORTS CONNECT": "Bein Sports",
    "linkedin.com": "LinkedIn",
    "wolframalpha.com": "WolframAlpha"
  },
  CATEGORY_BY_SERVICE: {
    "Netflix": "Video Streaming",
    "YouTube": "Video Streaming",
    "Disney+": "Video Streaming",
    "Hulu": "Video Streaming",
    "Prime Video": "Video Streaming",
    "HBO Max": "Video Streaming",
    "Paramount+": "Video Streaming",
    "Peacock": "Video Streaming",
    "Iflix": "Video Streaming",
    "WeTV": "Video Streaming",
    "iQiyi": "Video Streaming",
    "Bstation": "Video Streaming",
    "Crunchyroll": "Video Streaming",
    "Mubi": "Video Streaming",
    "Apple TV": "Video Streaming",
    "Spotify": "Music & Audio",
    "YouTube Music": "Music & Audio",
    "Apple Music": "Music & Audio",
    "Brain FM": "Music & Audio",
    "Figma": "Design & Creative Tools",
    "Capcut": "Design & Creative Tools",
    "Coohom": "Design & Creative Tools",
    "SVGator": "Design & Creative Tools",
    "Vectorizer": "Design & Creative Tools",
    "Pacdora": "Design & Creative Tools",
    "Epidemic Sound": "Design & Creative Tools",
    "Musicbed": "Design & Creative Tools",
    "Flaticon": "Design & Creative Tools",
    "Rawpixel": "Design & Creative Tools",
    "ProductionCrate": "Design & Creative Tools",
    "Motion Array": "Design & Creative Tools",
    "ChatGPT": "AI Services",
    "Deepseek": "AI Services",
    "Grok": "AI Services",
    "Perplexity": "AI Services",
    "Beutfiul AI": "AI Services",
    "Chutes AI": "AI Services",
    "Elicit AI": "AI Services",
    "Mermaid AI": "AI Services",
    "Relume AI": "AI Services",
    "Hixbypass": "AI Services",
    "BypassGPT": "AI Services",
    "Turbo AI": "AI Services",
    "Prezi AI": "AI Services",
    "NoteGPT": "AI Services",
    "Duolingo": "Education & Learning",
    "Coursera": "Education & Learning",
    "Udemy": "Education & Learning",
    "Skillshare": "Education & Learning",
    "MasterClass": "Education & Learning",
    "Busuu": "Education & Learning",
    "Quizlet": "Education & Learning",
    "Educative": "Education & Learning",
    "Datacamp": "Education & Learning",
    "Brilliant": "Education & Learning",
    "Symbolab": "Education & Learning",
    "Studocu": "Education & Learning",
    "Scholarcy": "Education & Learning",
    "WolframAlpha": "Education & Learning",
    "Everand": "Reading & Reference",
    "Academia": "Reading & Reference",
    "Slideshare": "Reading & Reference",
    "Curiosity": "Reading & Reference",
    "Notion": "Productivity & Utilities",
    "ClickUp": "Productivity & Utilities",
    "Grammarly": "Productivity & Utilities",
    "Paperpal": "Productivity & Utilities",
    "Speechify": "Productivity & Utilities",
    "ILoveIMG": "Productivity & Utilities",
    "ILovePDF": "Productivity & Utilities",
    "Bein Sports": "Sports",
    "LinkedIn": "Professional & Networking"
  }
};

// Pre-compute integrity hashes at startup
const RULES_HASH = crypto.createHash('sha256').update(JSON.stringify(rulesData)).digest('hex');
const SERVICES_HASH = crypto.createHash('sha256').update(JSON.stringify(servicesData)).digest('hex');

// ============================================
// HELPERS
// ============================================

function computeHash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

// ============================================
// ROUTES
// ============================================

// GET /api/config/rules — returns rules.json with integrity header
router.get('/rules', requireEnvelope, authenticate, (req, res) => {
  res.set('X-Integrity-Hash', RULES_HASH);
  res.set('X-Config-Version', '1');
  return res.json({ success: true, data: rulesData });
});

// GET /api/config/services — returns services.json with integrity header
router.get('/services', requireEnvelope, authenticate, (req, res) => {
  res.set('X-Integrity-Hash', SERVICES_HASH);
  res.set('X-Config-Version', '1');
  return res.json({ success: true, data: servicesData });
});

// GET /api/config/integrity — verifies if locally-stored configs match server
router.post('/integrity', requireEnvelope, authenticate, (req, res) => {
  const { rulesHash, servicesHash } = req.body || {};

  const result = {
    rules: {
      valid: !rulesHash || rulesHash === RULES_HASH,
      currentHash: RULES_HASH
    },
    services: {
      valid: !servicesHash || servicesHash === SERVICES_HASH,
      currentHash: SERVICES_HASH
    }
  };

  return res.json({ success: true, data: result });
});

module.exports = router;
