/* ── CONFIG ── */
const GEMINI_MODEL = 'gemini-2.0-flash';

/* ── DOM refs ── */
const apiKeyInput   = document.getElementById('api-key-input');
const inputEl       = document.getElementById('sentence-input');
const toneSelect    = document.getElementById('tone-select');
const translateBtn  = document.getElementById('translate-btn');
const clearBtn      = document.getElementById('clear-btn');
const copyBtn       = document.getElementById('copy-btn');
const copyFeedback  = document.getElementById('copy-feedback');
const loadingArea   = document.getElementById('loading-area');
const errorCard     = document.getElementById('error-card');
const errorMain     = document.getElementById('error-main');
const errorSub      = document.getElementById('error-sub');
const resultCard    = document.getElementById('result-card');
const emojiOutput   = document.getElementById('emoji-output');
const breakdownGrid = document.getElementById('breakdown-grid');
const examplesRow   = document.getElementById('examples-row');
const charCounter   = document.getElementById('char-counter');

/* ── Persist API key in sessionStorage ── */
if (apiKeyInput) {
  apiKeyInput.value = sessionStorage.getItem('gemini_api_key') || '';
  apiKeyInput.addEventListener('input', () => {
    sessionStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
  });
}

/* ── Char counter ── */
inputEl.addEventListener('input', () => {
  const len = inputEl.value.length;
  charCounter.textContent = `${len} / 500`;
  charCounter.style.color = len > 450 ? 'var(--accent1)' : '';
});

/* ── Example phrases ── */
const EXAMPLES = [
  "I love walking in the rain 🌧",
  "I'm so excited for my birthday! 🎂",
  "Pizza is better than homework 🍕",
  "She missed the last train home 🚂",
  "The world feels beautiful today 🌍",
  "I need coffee to survive Mondays ☕",
];

EXAMPLES.forEach(phrase => {
  const pill = document.createElement('button');
  pill.className = 'example-pill';
  pill.textContent = phrase;
  pill.type = 'button';
  pill.setAttribute('aria-label', `Use example: ${phrase}`);
  pill.addEventListener('click', () => {
    inputEl.value = phrase;
    charCounter.textContent = `${phrase.length} / 500`;
    inputEl.focus();
  });
  examplesRow.appendChild(pill);
});

/* ── Tone metadata ── */
const TONE_INSTRUCTIONS = {
  neutral:  'Use a balanced, neutral tone — straightforward and expressive.',
  funny:    'Make it playful and hilarious! Use funny, exaggerated, and surprising emojis for comedic effect.',
  dramatic: 'Go full theatrical drama! Use intense, over-the-top emojis as if every word is a life-or-death moment.',
  poetic:   'Be gentle and poetic. Choose soft, beautiful, nature-inspired emojis that evoke emotion and imagery.',
  sarcastic:'Be sarcastic and ironic. Use emojis in a dry, deadpan way — sometimes the opposite of what you\'d expect.',
};

/* ── State helpers ── */
function setLoading(on) {
  loadingArea.classList.toggle('visible', on);
  translateBtn.disabled = on;
  clearBtn.disabled = on;
}

function showError(main, sub) {
  errorCard.classList.add('visible');
  errorMain.textContent = main;
  errorSub.textContent  = sub || 'Please try again in a moment.';
  resultCard.classList.remove('visible');
}

function hideError() {
  errorCard.classList.remove('visible');
}

function showResult(data) {
  emojiOutput.textContent = data.emojiString || '';
  breakdownGrid.innerHTML = '';

  (data.breakdown || []).forEach((item, i) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.setAttribute('role', 'listitem');
    chip.style.animationDelay = `${i * 0.06}s`;
    chip.innerHTML = `
      <span class="chip-emoji" aria-hidden="true">${item.emoji}</span>
      <span class="chip-meaning">${escapeHtml(item.meaning)}</span>
    `;
    breakdownGrid.appendChild(chip);
  });

  resultCard.classList.add('visible');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Gemini API call ── */
async function translate(sentence, tone) {
  const toneHint = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.neutral;

  const systemPrompt = `You are an Emoji Translator. ${toneHint}

Given any sentence, return ONLY raw JSON (no markdown, no backticks, no extra text) in this exact shape:
{
  "emojiString": "<emojis only, no words>",
  "breakdown": [
    { "emoji": "<emoji or emoji group>", "meaning": "<short contextual meaning in plain English>" }
  ]
}

Rules:
- emojiString must contain ONLY emojis — no letters, punctuation, or spaces between unrelated groups.
- Each item in breakdown should map to one emoji or a tight group of related emojis.
- The breakdown items in order should reconstruct the meaning of the original sentence.
- Explanations must be concise plain English (e.g. "car / driving", "feeling happy", "missed the train").
- Apply the tone instruction above when choosing which emojis to use.`;

  const userPrompt = `Translate this sentence into emojis: "${sentence}"`;

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: tone === 'neutral' ? 0.7 : 1.0,
        maxOutputTokens: 512,
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API error ${response.status}: ${errBody}`);
  }

  const json = await response.json();
  const raw  = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Strip markdown fences just in case
  const cleaned = raw.replace(/```json?/gi, '').replace(/```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error('Could not parse AI response as JSON. Raw: ' + raw.slice(0, 200));
  }

  if (!parsed.emojiString || !Array.isArray(parsed.breakdown)) {
    throw new Error('Unexpected response shape from AI.');
  }

  return parsed;
}

/* ── Translate handler ── */
async function handleTranslate() {
  const sentence = inputEl.value.trim();
  const tone     = toneSelect?.value || 'neutral';

  // Validate API key
  if (!apiKeyInput?.value.trim()) {
    apiKeyInput.focus();
    apiKeyInput.classList.add('shake');
    setTimeout(() => apiKeyInput.classList.remove('shake'), 600);
    showError('API key required 🔑', 'Please enter your Gemini API key above to start translating.');
    return;
  }

  if (!sentence) {
    inputEl.focus();
    inputEl.classList.add('shake');
    setTimeout(() => inputEl.classList.remove('shake'), 600);
    return;
  }

  hideError();
  resultCard.classList.remove('visible');
  setLoading(true);

  try {
    const data = await translate(sentence, tone);
    showResult(data);
  } catch (err) {
    console.error(err);
    if (err.message.includes('parse')) {
      showError("Couldn't read the AI's response 🤔", 'The AI returned something unexpected. Try rephrasing your sentence.');
    } else if (err.message.includes('API error 400')) {
      showError('Bad request 🤔', 'The request was malformed. Try a shorter or different sentence.');
    } else if (err.message.includes('API error 401') || err.message.includes('API error 403')) {
      showError('Invalid API key 🔑', 'The Gemini API key appears to be incorrect or expired.');
    } else if (err.message.includes('API error 429')) {
      showError('Rate limited ⏳', 'Too many requests. Wait a moment and try again.');
    } else if (err.message.includes('API error')) {
      showError('API request failed 😬', err.message);
    } else {
      showError('Something went wrong! 😬', err.message || 'Unknown error. Please try again.');
    }
  } finally {
    setLoading(false);
  }
}

/* ── Copy handler ── */
function handleCopy() {
  const text = emojiOutput.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    copyFeedback.classList.add('show');
    setTimeout(() => copyFeedback.classList.remove('show'), 2200);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    copyFeedback.classList.add('show');
    setTimeout(() => copyFeedback.classList.remove('show'), 2200);
  });
}

/* ── Clear handler ── */
function handleClear() {
  inputEl.value = '';
  charCounter.textContent = '0 / 500';
  charCounter.style.color = '';
  hideError();
  resultCard.classList.remove('visible');
  inputEl.focus();
}

/* ── Event listeners ── */
translateBtn.addEventListener('click', handleTranslate);
clearBtn.addEventListener('click', handleClear);
copyBtn.addEventListener('click', handleCopy);

// Submit on Ctrl+Enter / Cmd+Enter
inputEl.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleTranslate();
});
