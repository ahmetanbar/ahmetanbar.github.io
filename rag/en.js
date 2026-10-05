"use strict";
// The English case study. Every number comes from data-en.js (site/en/export.py); the BM25 runs here
// and is checked against Python's in the footer.

const LAB = window.LAB_EN;
const { englishTokenizers, BM25, rrf, checkEnglish } = window.LabBM25;
const { recallAt, ndcgAt, gainsOf } = window.LabMetrics;

const $ = (selector) => document.querySelector(selector);
const esc = (text) => String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const pct = (value) => `${Math.round(value * 100)}%`;
const two = (value) => value.toFixed(2);
const three = (value) => value.toFixed(3);

const passages = new Map(LAB.passages.map((passage) => [passage.id, passage]));
const questions = new Map(LAB.questions.map((question) => [question.id, question]));
const english = englishTokenizers(LAB.words);
const indexes = { naive: new BM25(LAB.passages, english.naive), snowball: new BM25(LAB.passages, english.snowball), stopped: new BM25(LAB.passages, english.stopped) };

const nDCG = (language, stage) => LAB.metrics[language][stage].summary["nDCG@10"];
const recall1 = (language, stage) => LAB.metrics[language][stage].summary["recall@1"];
const kindScore = (language, stage, kind) => LAB.metrics[language][stage].byKind[kind];
const shipped = (stage) => LAB.stopped[stage] || stage; // English with stop words left out of BM25
const answers = (language, variant, group = "old") => LAB.answers[language][variant][group];
const holds = (question, id) => question.targets.some((target) => target.passages.includes(id));
const lastTitle = (id) => passages.get(id).title.split(" > ").slice(-1)[0];
const rankWords = (rank) => (rank ? `#${rank}` : "not in the top 20");
const placeWords = (rank) => (rank ? `at #${rank}` : "outside the top 20");

const SECTIONS = [
  { id: "rag", number: "0", title: "How RAG works" },
  { id: "overview", number: "↗", title: "Five minutes version" },
  { id: "s1", number: "1", title: "Setup and measuring" },
  { id: "s2", number: "2", title: "Keyword search and word forms" },
  { id: "s3", number: "3", title: "Meaning and hybrid search" },
  { id: "s4", number: "4", title: "Reranking and \"I don't know\"" },
  { id: "s5", number: "5", title: "Conversation and query writing" },
  { id: "s6", number: "6", title: "Answers and judges" },
  { id: "s7", number: "7", title: "Fixed pipeline or agent" },
  { id: "s8", number: "8", title: "What I'd ship, what I didn't measure" },
];

function renderToc() {
  $("#toc").innerHTML = `<div class="toc-title">Sections</div>` + SECTIONS.map((section) => `
    <a href="#${section.id}" class="${section.later ? "later" : ""}"><span class="num">${section.number}</span><span>${esc(section.title)}${SECTION_TERMS[section.id] ? `<small class="toc-terms">${esc(SECTION_TERMS[section.id].map((key) => TERMS[key][0]).join(" · "))}</small>` : ""}</span>${section.later ? " <small>next</small>" : ""}</a>`).join("");
}

const PIPELINE = [
  { label: "Chunk", sub: "12 documents → 55 passages, cut at headings", jump: "s1" },
  { label: "BM25", stage: "bm25-naive", sub: "keyword search", jump: "s2" },
  { label: "+ word forms", stage: "bm25-stem", sub: "EN: stemming, no stop words · TR: first five letters", jump: "s2" },
  { label: "Embeddings", stage: "e5", sub: "runs beside BM25", jump: "s3", side: true },
  { label: "Hybrid", stage: "rrf", sub: "both lists, fused by rank", jump: "s3" },
  { label: "Rerank", stage: "jev", sub: "a small model reads the top 20", jump: "s4" },
  { label: "History", stage: "history", sub: "previous message added", jump: "s5" },
];

function renderPipeline() {
  const boxes = PIPELINE.map((box) => {
    const numbers = box.stage
      ? `<div class="scores"><span><small>EN</small>${two(nDCG("EN", shipped(box.stage)))}</span><span><small>TR</small>${two(nDCG("TR", box.stage))}</span></div>`
      : `<div class="scores muted"><span><small>EN</small>55</span><span><small>TR</small>55</span></div>`;
    return `<a class="pipe-box ${box.side ? "side" : ""}" href="#${box.jump}"><b>${esc(box.label)}</b>${numbers}<small>${esc(box.sub)}</small></a>`;
  });
  const answer = (language) => answers(language, "arama, sıkı");
  boxes.push(`<a class="pipe-box answer" href="#s6"><b>Answer</b>
    <div class="scores"><span><small>EN</small>${pct(answer("EN").correct)}</span><span><small>TR</small>${pct(answer("TR").correct)}</span></div>
    <small>correct · ${pct(answer("EN").faithful)} / ${pct(answer("TR").faithful)} faithful to the passages</small></a>`);
  $("#pipeline").innerHTML = `<div class="pipe">${boxes.join('<span class="pipe-arrow">→</span>')}</div>`;
  $("#pipeline-note").textContent = "Search boxes: nDCG@10 on 52 questions, each step on top of the ones before it (the embedding box is the embedding alone). English numbers from the second box on are with stop words left out of BM25, which Section 3 explains. Answer box: the strict instructions of Section 6, with the full search.";
}

function renderFindings() {
  const weak = (language) => pct(answers(language, "zayıf arama, sıkı").correct);
  const hyde = (language) => pct(answers(language, "zayıf arama + HyDE, sıkı").correct);
  const agent = (language) => pct(answers(language, "agent, zayıf arama").correct);
  const findings = [
    `<b>Answering is the same in both languages; every difference is in search.</b> With the full search and strict instructions the answers were ${pct(answers("EN", "arama, sıkı").correct)} correct in English and ${pct(answers("TR", "arama, sıkı").correct)} in Turkish; an agent on a weak search got ${agent("EN")} in both.`,
    `<b>Turkish loses more to word forms, but its crude fix works better.</b> Cutting every word to its first five letters takes Turkish keyword search from ${two(nDCG("TR", "bm25-naive"))} to ${two(nDCG("TR", "bm25-stem"))}; a proper English stemmer takes English only from ${two(nDCG("EN", "bm25-naive"))} to ${two(nDCG("EN", "bm25-stem"))}. English's trouble is synonyms, not suffixes.`,
    `<b>English stop words broke hybrid search.</b> Fusing keyword and embedding results by rank gave ${two(nDCG("EN", "rrf"))}, below the embedding alone (${two(nDCG("EN", "e5"))}), because "what" and "my" gave most passages a rank. With stop words left out, the English pipeline ended where the Turkish one did: nDCG ${two(nDCG("EN", "history-stop"))}, recall@1 ${two(recall1("EN", "history-stop"))}.`,
    `<b>Loose instructions invented a medical permission, in both languages.</b> Asked "When can I smoke?" a week after an extraction, the model said the waiting period had passed; the documents only say "avoid smoking on the first day". A few lines of strict instructions stopped it, at no cost in correctness.`,
    `<b>With a weak search, one query the model writes first gets most of an agent's gain.</b> Correct answers: ${weak("EN")} with the weak search alone, ${hyde("EN")} with a hypothetical passage (HyDE) searched beside the message, ${agent("EN")} with an agent that searches as often as it likes. Turkish: ${weak("TR")}, ${hyde("TR")}, ${agent("TR")}.`,
  ];
  $("#findings").innerHTML = findings.map((text) => `<li>${text}</li>`).join("");
}

function renderShip() {
  const rerank = LAB.calls.rerank.EN;
  const time = (variant) => `${(answers("EN", variant).answer_ms / 1000).toFixed(1)} s`;
  const cost = (variant) => `$${answers("EN", variant).answer_cost.toFixed(5)}`;
  const rows = [
    ["Chunk at headings, the heading path kept in each passage", "fixed-size and sentence cuts", "best of four cuts at the same word budget (measured in Turkish)", "once, when indexing"],
    ["A tokenizer per language: Turkish first five letters; English Snowball and stop words", "one tokenizer for both", `TR ${two(nDCG("TR", "bm25-naive"))} → ${two(nDCG("TR", "bm25-stem"))}, EN ${two(nDCG("EN", "bm25-naive"))} → ${two(nDCG("EN", "bm25-stop"))}`, "free, under 1 ms"],
    ["A small multilingual embedding on the same machine (e5-small)", "a paid embedding API", `${two(nDCG("EN", "e5"))} EN, ${two(nDCG("TR", "e5"))} TR on its own; text never leaves the machine`, "free, ~10 ms"],
    ["Hybrid search with RRF, measured per language", "either search alone", `TR ${two(nDCG("TR", "e5"))} → ${two(nDCG("TR", "rrf"))}; EN ${two(nDCG("EN", "e5"))} → ${two(nDCG("EN", "rrf-stop"))}, so not a given`, "free"],
    ["Rerank the top 20 with a small yes/no model (Jev)", "no rerank", `EN ${two(nDCG("EN", "rrf-stop"))} → ${two(nDCG("EN", "jev-stop"))}, TR ${two(nDCG("TR", "rrf"))} → ${two(nDCG("TR", "jev"))}: the biggest single step`, `+${Math.round(rerank.ms)} ms, $${rerank.cost.toFixed(5)}`],
    ["Prepend the previous message to the query", "an LLM rewrite of the query", `EN ${two(nDCG("EN", "history-stop"))}, TR ${two(nDCG("TR", "history"))}; in Turkish the rewrite was slower and slightly worse`, "free"],
    ["Numbered passages, strict instructions, cited sources", "loose instructions", `stopped the invented advice; ${pct(answers("EN", "arama, sıkı").correct)} EN, ${pct(answers("TR", "arama, sıkı").correct)} TR correct`, `${time("arama, sıkı")}, ${cost("arama, sıkı")}`],
    ["If search is weak or unknown: let the model write the query first (HyDE beside the message)", "an agent loop", `${pct(answers("EN", "zayıf arama, sıkı").correct)} → ${pct(answers("EN", "zayıf arama + HyDE, sıkı").correct)} correct; the agent reached ${pct(answers("EN", "agent, zayıf arama").correct)}`, `+${(LAB.calls.hyde.ms / 1000).toFixed(1)} s, $${LAB.calls.hyde.cost.toFixed(5)} (agent: ${time("agent, zayıf arama")} per answer)`],
  ];
  $("#ship").innerHTML = `<div class="table-scroll"><table class="report wrap"><thead><tr><th>choice</th><th>instead of</th><th>what it bought</th><th>added to every answer</th></tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td>${index ? esc(cell) : `<b>${esc(cell)}</b>`}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    <p class="overall">Costs are what this lab measured per answer: Jev and GPT-6 Luna through their APIs, everything else on a laptop. Times are medians.</p>`;
}

const KIND_EXAMPLES = [
  ["exact", "e04", "The question's words are in the passage as they are."],
  ["morphology", "m03", "The same word in another form or spelling."],
  ["paraphrase", "p01", "The same meaning in other words."],
  ["multi", "x01", "The answer needs two passages."],
  ["followup", "f09", "Only makes sense after the message before it."],
  ["statement", "s03", "Not a question, but it calls for a passage."],
  ["none", "n03", "The documents don't have the answer."],
];
const KIND_NAMES = { exact: "Same words", morphology: "Word form", paraphrase: "Other words", multi: "Two passages", followup: "Follow-up", statement: "Statement", none: "No answer" };

function renderSets() {
  const { EN, TR } = LAB.sets;
  const rows = [["Documents", EN.documents, TR.documents], ["Passages", EN.passages, TR.passages], ["Questions, in 7 kinds", EN.questions, TR.questions], ["Hard questions for the answer side", EN.hard, TR.hard], ["Chat messages that need no search", EN.chat, TR.chat]];
  $("#sets").innerHTML = `<table class="report"><thead><tr><th></th><th>English</th><th>Turkish</th></tr></thead><tbody>${rows.map(([label, en, tr]) => `<tr><td>${label}</td><td class="num">${en}</td><td class="num">${tr}</td></tr>`).join("")}</tbody></table>`;
}

function renderKinds() {
  const said = (question) => (question.history.length ? `<span class="faint">${esc(question.history.join(" "))} → </span>` : "") + esc(question.text);
  $("#kinds").innerHTML = `<table class="report wrap"><thead><tr><th>kind</th><th>English</th><th>Turkish (same id)</th></tr></thead><tbody>${KIND_EXAMPLES.map(([kind, id, note]) => {
    const question = questions.get(id);
    return `<tr><td><b>${KIND_NAMES[kind]}</b><br><small class="faint">${esc(note)}</small></td><td>${said(question)}</td><td>${said(LAB.turkish[id])}</td></tr>`;
  }).join("")}</tbody></table>`;
}

const rankToy = { question: "m03", order: null };

function renderRankToy() {
  const question = questions.get(rankToy.question);
  if (!rankToy.order) rankToy.order = LAB.results["bm25-naive"][question.id].slice(0, 10);
  const order = rankToy.order;
  const gains = gainsOf(question, order);
  const total = question.targets.length;
  const at = order.findIndex((id) => holds(question, id));
  const move = (by) => {
    const next = Math.max(0, Math.min(order.length - 1, at + by));
    [order[at], order[next]] = [order[next], order[at]];
    renderRankToy();
  };
  $("#rank-toy").innerHTML = `
    <p class="overall">"${esc(question.text)}", searched with plain BM25. The document's answer: <q>${esc(question.targets[0].quote)}</q></p>
    <div class="rank-split">
      <ol class="rank-list">${order.map((id, index) => `<li class="${holds(question, id) ? "target" : ""}"><span class="num">${index + 1}</span>${esc(lastTitle(id))}${holds(question, id) ? ' <span class="tick">✓</span>' : ""}</li>`).join("")}</ol>
      <div class="metric-cards">
        <div class="row"><button class="btn small" data-move="-1" ${at > 0 ? "" : "disabled"}>↑ move it up</button><button class="btn small" data-move="1" ${at >= 0 && at < order.length - 1 ? "" : "disabled"}>↓ move it down</button><button class="btn small" data-move="reset">reset</button></div>
        <div class="metric-card"><span>recall@1</span><b>${two(recallAt(gains, total, 1))}</b><small>is it first?</small></div>
        <div class="metric-card"><span>recall@5</span><b>${two(recallAt(gains, total, 5))}</b><small>is it in what the model sees?</small></div>
        <div class="metric-card"><span>nDCG@10</span><b>${two(ndcgAt(gains, total, 10))}</b><small>1 / log₂(rank + 1)</small></div>
      </div>
    </div>`;
  for (const button of document.querySelectorAll("#rank-toy [data-move]")) {
    button.onclick = () => (button.dataset.move === "reset" ? ((rankToy.order = null), renderRankToy()) : move(Number(button.dataset.move)));
  }
}

function renderJudges() {
  const { EN, TR } = LAB.judgeCheck;
  $("#judges-text").innerHTML = `An answer is free text: "7,500 TL" and "seven and a half thousand lira" are the same answer. So a second model grades it, twice. <b>Correct?</b> Does it agree with a note on what a good answer says? <b>Faithful?</b> The answer is split into short claims and each one is checked against the passages it was written from; one unsupported claim makes the answer unfaithful. Before trusting either judge I wrote 21 answers whose verdict I knew, and checked the judges on them: correct ${EN.correct.right}/${EN.correct.of} in English and ${TR.correct.right}/${TR.correct.of} in Turkish, faithful ${EN.faithful.right}/${EN.faithful.of} and ${TR.faithful.right}/${TR.faithful.of}. The miss is the same in both: the faithfulness judge accepted a wrong sum. It reads text well and does no arithmetic.`;
}

function renderS1Means() {
  $("#s1-means").innerHTML = `<b>What this means for a product.</b> Build the ruler before the first optimisation, and test the judge before trusting it. The judge check found two real flaws in my judges and missed a third, which I only saw by reading the answers it graded. Section 6 has the details.`;
}

function renderS2Problem() {
  const rank = (stage) => LAB.ranks.EN[stage].m03;
  $("#s2-problem").innerHTML = `<b>Problem.</b> "Can I pay in installments?" The document spells it <i>instalments</i>, the British way. To plain BM25 these are two unrelated words, and the right passage lands ${placeWords(rank("bm25-naive"))}. In Turkish the same problem is everywhere: <i>otoparkınız</i> (your car park) and <i>otopark</i> (car park) are different words to a search engine, and Turkish glues several suffixes onto most words.`;
}

function meets(pair) {
  const [asked, written] = pair;
  return asked.some((word) => written.includes(word));
}

function renderPairs() {
  const table = (language, label, names) => `<div><div class="label">${label}</div><table class="report wrap pairs"><thead><tr><th>patient</th><th>document</th>${names.map((name) => `<th>${name}</th>`).join("")}</tr></thead><tbody>${LAB.pairs[language].map((pair) => `<tr><td>${esc(pair.asked)}</td><td>${esc(pair.written)}</td>${["naive", "stemmed"].map((name) => `<td class="${meets(pair.words[name]) ? "good" : "bad"}">${esc(pair.words[name][0].join(" "))} · ${esc(pair.words[name][1].join(" "))} ${meets(pair.words[name]) ? "✓" : "✗"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  $("#pairs").innerHTML = `<div class="side-by-side">${table("EN", "English", ["plain words", "Snowball stemming"])}${table("TR", "Turkish", ["plain words", "first five letters"])}</div>
    <p class="overall">Stemming joins spellings and endings. It doesn't join "child" and "children" (an irregular plural) or "whiter" and "whitening"; the first five letters join Turkish suffixes, and one false friend: <i>ücreti</i> (its fee) and <i>ücretsiz</i> (free).</p>`;
}

const TOKENIZER_QUESTIONS = ["m03", "m06", "m01", "m05", "e08", "p03"];
const tokenizerToy = { question: "m03" };
const TOKENIZER_COLUMNS = [["naive", "Plain words"], ["snowball", "Snowball stemming"], ["stopped", "Stemming, no stop words"]];

function renderTokenizerToy() {
  const question = questions.get(tokenizerToy.question);
  const columns = TOKENIZER_COLUMNS.map(([name, label]) => {
    const index = indexes[name];
    const found = index.search(question.text, 20);
    const rank = found.findIndex((hit) => holds(question, hit.passage.id)) + 1;
    const words = english[name](question.text).map((word) => {
      const df = index.documentFrequency(word);
      return `<span class="token ${df ? "" : "missing"}">${esc(word)}${df ? `<sup>${df}</sup>` : ""}</span>`;
    }).join("");
    return `<div class="card mode-column"><div class="label">${label}</div><div class="tokens">${words}</div>
      <span class="where ${rank && rank <= 5 ? "top" : "lost"}">right passage: ${rankWords(rank)}</span>
      <ol class="try-top">${found.slice(0, 3).map((hit, place) => `<li class="${holds(question, hit.passage.id) ? "found-row" : ""}"><span class="num">${place + 1}</span>${holds(question, hit.passage.id) ? '<span class="tick">✓</span>' : ""}${esc(lastTitle(hit.passage.id))}</li>`).join("")}</ol>
      <small class="faint">${found.length} of 55 passages get a score</small></div>`;
  }).join("");
  $("#tokenizer-toy").innerHTML = `
    <div class="pills">${TOKENIZER_QUESTIONS.map((id) => `<button data-q="${id}" class="${id === question.id ? "on" : ""}">${esc(questions.get(id).text)}</button>`).join("")}</div>
    <p class="overall">The document says: <q>${esc(question.targets[0].quote)}</q></p>
    <div class="three-columns">${columns}</div>
    <p class="overall">The small number on a word: how many of the 55 passages contain it. A crossed-out word is in none. This search runs in your browser.</p>`;
  for (const button of document.querySelectorAll("#tokenizer-toy [data-q]")) button.onclick = () => { tokenizerToy.question = button.dataset.q; renderTokenizerToy(); };
}

function renderS2Result() {
  const rows = [["Plain BM25", "bm25-naive", "bm25-naive"], ["+ word forms (EN Snowball, TR first five letters)", "bm25-stem", "bm25-stem"], ["+ no stop words (English only)", "bm25-stop", null]];
  $("#s2-result").innerHTML = `<b>Result.</b> Word forms matter more in Turkish, and the crude fix recovers more there.
    <div class="table-scroll"><table class="report"><thead><tr><th></th><th>EN nDCG@10</th><th>TR nDCG@10</th><th>EN, word-form questions</th><th>TR, word-form questions</th></tr></thead><tbody>
    ${rows.map(([label, en, tr]) => `<tr><td>${esc(label)}</td><td class="num">${three(nDCG("EN", en))}</td><td class="num">${tr ? three(nDCG("TR", tr)) : "-"}</td><td class="num">${two(kindScore("EN", en, "morphology"))}</td><td class="num">${tr ? two(kindScore("TR", tr, "morphology")) : "-"}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="overall">52 questions; the word-form column is the 7 questions of that kind. Removing English stop words helps BM25 on its own (${three(nDCG("EN", "bm25-stem"))} → ${three(nDCG("EN", "bm25-stop"))}); Section 3 shows why it matters far more for the hybrid.</p>
    <b>What this means for a product.</b> The tokenizer is per language, and it is the one part of the pipeline that is. Keep it outside the search engine: split the words yourself and let the engine (SQLite, Postgres, Elasticsearch) store them.`;
}

function renderS2Limit() {
  $("#s2-limit").innerHTML = `<b>Limit.</b> No tokenizer joins words that only mean the same thing. "What does it cost to get my teeth whiter?" has no word in common with "In-office whitening: 5,000 TL" once stems are taken, and "I'm expecting a baby" has none with "the second trimester". That takes a search by meaning: Section 3.`;
}

function renderFooter() {
  const problems = checkEnglish(LAB);
  const searched = Object.values(LAB.bm25).reduce((sum, expected) => sum + Object.keys(expected).length, 0);
  $("#check").className = `check ${problems.length ? "bad" : "ok"}`;
  $("#check").textContent = problems.length
    ? `Warning: the browser's BM25 disagrees with Python's in ${problems.length} places (${problems[0]}).`
    : `✓ The BM25 in your browser gives the same results as the lab's Python code (${searched} searches with three tokenizers).`;
  $("#generated").textContent = `Data: site/en/export.py, ${LAB.generated}.`;
}

const rankOf = (language, stage, id) => LAB.ranks[language][stage][id];

function renderS3Problem() {
  const question = questions.get("p03");
  $("#s3-problem").innerHTML = `<b>Problem.</b> "${esc(question.text)}" The answer is <q>${esc(question.targets[0].quote)}</q>. Once stems are taken the two share no word: <i>whiter</i> is not <i>whiten</i>, and <i>cost</i> is not a word the price list uses. The best keyword search leaves the right passage ${placeWords(rankOf("EN", "bm25-stop", "p03"))}.`;
}

const FUSION_QUESTIONS = ["p03", "p06", "p07", "m03", "f13"];
const fusionToy = { question: "p03", stopped: false };

function fusionColumn(label, rows, question, note) {
  const rank = rows.findIndex(([id]) => holds(question, id)) + 1;
  return `<div class="card mode-column"><div class="label">${label}</div>
    <span class="where ${rank && rank <= 5 ? "top" : "lost"}">right passage: ${rankWords(rank && rank <= 20 ? rank : 0)}</span>
    <ol class="try-top">${rows.slice(0, 5).map(([id], place) => `<li class="${holds(question, id) ? "found-row" : ""}"><span class="num">${place + 1}</span>${holds(question, id) ? '<span class="tick">✓</span>' : ""}${esc(lastTitle(id))}</li>`).join("")}</ol>
    <small class="faint">${note}</small></div>`;
}

function renderFusionToy() {
  const question = questions.get(fusionToy.question);
  const lexical = LAB.lists[fusionToy.stopped ? "bm25-stop" : "bm25-stem"][question.id];
  const meaning = LAB.lists.e5[question.id];
  const fused = rrf([lexical, meaning]);
  const target = fused.find(([id]) => holds(question, id));
  const place = (rows, id) => rows.findIndex(([passage]) => passage === id) + 1;
  const share = (rows, id) => (place(rows, id) ? `1 / (60 + ${place(rows, id)})` : "0");
  const math = target ? `The right passage's score: ${share(lexical, target[0])} from the keyword list + ${share(meaning, target[0])} from the embedding list = ${target[1].toFixed(4)}. A passage that is 20th in both lists gets 2 / 80 = 0.0250.` : "";
  $("#fusion-toy").innerHTML = `
    <div class="toy-controls"><div class="pills">${FUSION_QUESTIONS.map((id) => `<button data-q="${id}" class="${id === question.id ? "on" : ""}">${esc(questions.get(id).text)}</button>`).join("")}</div>
      <div class="pills"><button data-stop="false" class="${fusionToy.stopped ? "" : "on"}">stop words kept</button><button data-stop="true" class="${fusionToy.stopped ? "on" : ""}">stop words removed</button></div></div>
    <div class="three-columns">
      ${fusionColumn("Keyword search (BM25, stemmed)", lexical, question, `${lexical.length} of 55 passages get a rank`)}
      ${fusionColumn("Embedding search (e5)", meaning, question, "every passage gets a rank")}
      ${fusionColumn("Hybrid (RRF)", fused, question, "1 / (60 + rank) from each list")}
    </div>
    <p class="overall">${math}</p>`;
  for (const button of document.querySelectorAll("#fusion-toy [data-q]")) button.onclick = () => { fusionToy.question = button.dataset.q; renderFusionToy(); };
  for (const button of document.querySelectorAll("#fusion-toy [data-stop]")) button.onclick = () => { fusionToy.stopped = button.dataset.stop === "true"; renderFusionToy(); };
}

function renderS3Result() {
  const rows = [
    ["Best keyword search", "bm25-stop", "bm25-stem", "EN: stemmed, no stop words · TR: first five letters"],
    ["Embedding alone (e5)", "e5", "e5", ""],
    ["Hybrid (RRF), stop words kept", "rrf", "rrf", ""],
    ["Hybrid (RRF), stop words removed", "rrf-stop", null, "English only"],
  ];
  $("#s3-result").innerHTML = `<b>Result.</b> Embeddings close most of the gap between the languages, and are best at questions in other words. Hybrid search helped Turkish and hurt English.
    <div class="table-scroll"><table class="report"><thead><tr><th></th><th>EN nDCG@10</th><th>TR nDCG@10</th><th>EN, other-words questions</th><th>TR, other-words questions</th></tr></thead><tbody>
    ${rows.map(([label, en, tr, note]) => `<tr><td>${esc(label)}${note ? `<br><small class="faint">${esc(note)}</small>` : ""}</td><td class="num">${three(nDCG("EN", en))}</td><td class="num">${tr ? three(nDCG("TR", tr)) : "-"}</td><td class="num">${two(kindScore("EN", en, "paraphrase"))}</td><td class="num">${tr ? two(kindScore("TR", tr, "paraphrase")) : "-"}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="overall">Why English: BM25 gives a passage a score for any shared word, and English questions share "what", "my", "to" and "the" with almost every passage. The scores of those passages are tiny, but RRF only sees ranks, so each of them is a full entry in the keyword list, and many ordinary passages in the middle of both lists overtake a passage that is near the top of one. Turkish packs those words into suffixes, so its keyword lists are short. Removing stop words shortens the English list, but the hybrid still stays just below the embedding: in English the keyword search is the weak partner.</p>
    <b>What this means for a product.</b> Hybrid search is not free accuracy; measure it per language and per data set. If the keyword side is weak, fuse with weights, or let the reranker fix the order.`;
}

function renderS3Limit() {
  $("#s3-limit").innerHTML = `<b>Limit.</b> The right passage is now in the top 20 for almost every question, but often not first: the hybrid's recall@1 is ${two(recall1("EN", "rrf-stop"))} in English and ${two(recall1("TR", "rrf"))} in Turkish. The model only sees the top five. Something has to read the candidates and put the right one first.`;
}

function renderS4Problem() {
  const question = questions.get("p07");
  $("#s4-problem").innerHTML = `<b>Problem.</b> "${esc(question.text)}" The hybrid search finds the right passage, <q>${esc(question.targets[0].quote)}</q>, but puts it ${placeWords(rankOf("EN", "rrf-stop", "p07"))}. Neither search ever read the question and the passage together.`;
}

const RERANK_QUESTIONS = ["p07", "p03", "x03", "s01", "m05"];
const rerankToy = { question: "p07" };

function renderRerankToy() {
  const question = questions.get(rerankToy.question);
  const column = (label, stage) => {
    const ids = LAB.results[stage][question.id].slice(0, 8);
    return `<div class="card mode-column"><div class="label">${label}</div><span class="where ${rankOf("EN", stage, question.id) <= 5 ? "top" : "lost"}">right passage: ${rankWords(rankOf("EN", stage, question.id))}</span>
      <ol class="try-top">${ids.map((id, place) => `<li class="${holds(question, id) ? "found-row" : ""}"><span class="num">${place + 1}</span>${holds(question, id) ? '<span class="tick">✓</span>' : ""}${esc(lastTitle(id))}</li>`).join("")}</ol></div>`;
  };
  $("#rerank-toy").innerHTML = `
    <div class="pills">${RERANK_QUESTIONS.map((id) => `<button data-q="${id}" class="${id === question.id ? "on" : ""}">${esc(questions.get(id).text)}</button>`).join("")}</div>
    <div class="side-by-side">${column("Hybrid search (RRF)", "rrf-stop")}${column("After the reranker (Jev)", "jev-stop")}</div>
    <p class="overall">English, stop words removed. The reranker can only reorder the 20 candidates it gets: a passage the hybrid leaves out is lost for good.</p>`;
  for (const button of document.querySelectorAll("#rerank-toy [data-q]")) button.onclick = () => { rerankToy.question = button.dataset.q; renderRerankToy(); };
}

const thresholdToy = { language: "EN", threshold: null };

function thresholdPoints(language) {
  const answerable = new Set([...questions.values()].filter((question) => question.targets.length).map((question) => question.id));
  return Object.entries(LAB.topScores[language]).map(([id, score]) => ({ id, score, answerable: answerable.has(id) }));
}

function bestThreshold(points) {
  let best = [0, points.filter((point) => point.answerable).length];
  for (const cut of [...new Set(points.map((point) => point.score))].sort((a, b) => a - b)) {
    const right = points.filter((point) => (point.answerable ? point.score >= cut : point.score < cut)).length;
    if (right > best[1]) best = [cut, right];
  }
  return best;
}

function renderThresholdToy() {
  const points = thresholdPoints(thresholdToy.language);
  if (thresholdToy.threshold === null) thresholdToy.threshold = bestThreshold(points)[0];
  const threshold = thresholdToy.threshold;
  const width = 720, left = 24, margin = 24;
  const x = (value) => left + value * (width - left - margin);
  const dots = points.map((point, index) => {
    const wrong = point.answerable ? point.score < threshold : point.score >= threshold;
    return `<circle cx="${x(point.score)}" cy="${(point.answerable ? 46 : 112) + ((index * 7) % 15) - 7}" r="6" class="${point.answerable ? "yes" : "no"} ${wrong ? "wrong" : ""}"><title>${esc(questions.get(point.id).text)}: ${point.score.toFixed(2)}</title></circle>`;
  }).join("");
  const refused = points.filter((point) => point.score < threshold);
  const missed = refused.filter((point) => point.answerable).length;
  const invented = points.filter((point) => !point.answerable && point.score >= threshold).length;
  const right = points.length - missed - invented;
  const [bestAt, bestRight] = bestThreshold(points);
  const always = points.filter((point) => point.answerable).length;
  $("#threshold-toy").innerHTML = `
    <div class="pills"><button data-language="EN" class="${thresholdToy.language === "EN" ? "on" : ""}">English</button><button data-language="TR" class="${thresholdToy.language === "TR" ? "on" : ""}">Turkish</button></div>
    <svg viewBox="0 0 ${width} 150" class="threshold-strip">
      <rect x="${left}" y="28" width="${Math.max(0, x(threshold) - left)}" height="100" class="refuse-zone"/>
      <text x="${left}" y="22" class="label-svg">THE DOCUMENTS HAVE THE ANSWER</text><text x="${left + 4}" y="88" class="label-svg">THEY DON'T</text>
      ${dots}<line x1="${x(threshold)}" x2="${x(threshold)}" y1="24" y2="132" class="threshold-line"/>
      <text x="${x(threshold) + 6}" y="144" class="dot-label">threshold ${threshold.toFixed(2)}</text></svg>
    <label class="slider"><span>threshold: below it the assistant says it doesn't know</span><input type="range" min="0" max="1" step="0.01" value="${threshold}" id="threshold-slider"></label>
    <div class="toy-verdict"><b>${right} / ${points.length} handled right.</b> "I don't know" for ${refused.length}${missed ? `, <span class="bad">${missed} of which did have an answer</span>` : ""}. ${invented ? `<span class="bad">It would try to answer ${invented} question${invented > 1 ? "s" : ""} the documents can't.</span>` : "Every question without an answer is caught."} Best threshold for this language: ${bestAt.toFixed(2)}, ${bestRight} / ${points.length}. Never saying "I don't know": ${always} / ${points.length}.</div>`;
  for (const button of document.querySelectorAll("#threshold-toy [data-language]")) button.onclick = () => { thresholdToy.language = button.dataset.language; thresholdToy.threshold = null; renderThresholdToy(); };
  const slider = $("#threshold-slider");
  slider.oninput = () => { thresholdToy.threshold = Number(slider.value); renderThresholdToy(); };
}

function renderS4Result() {
  const rerank = LAB.calls.rerank;
  $("#s4-result").innerHTML = `<b>Result.</b> The biggest single step in both languages, and the first signal that can say "I don't know".
    <div class="table-scroll"><table class="report"><thead><tr><th></th><th>EN recall@1</th><th>EN nDCG@10</th><th>TR recall@1</th><th>TR nDCG@10</th><th>per question</th></tr></thead><tbody>
    <tr><td>Hybrid (RRF)</td><td class="num">${two(recall1("EN", "rrf-stop"))}</td><td class="num">${three(nDCG("EN", "rrf-stop"))}</td><td class="num">${two(recall1("TR", "rrf"))}</td><td class="num">${three(nDCG("TR", "rrf"))}</td><td>free</td></tr>
    <tr><td>+ Rerank (Jev)</td><td class="num">${two(recall1("EN", "jev-stop"))}</td><td class="num">${three(nDCG("EN", "jev-stop"))}</td><td class="num">${two(recall1("TR", "jev"))}</td><td class="num">${three(nDCG("TR", "jev"))}</td><td>${Math.round(rerank.EN.ms)} ms, $${rerank.EN.cost.toFixed(5)}</td></tr>
    </tbody></table></div>
    <p class="overall">I also tried GPT-6 Luna reading all 20 passages and ordering them, and a free cross-encoder (bge-reranker) on the laptop. Luna matched Jev's quality but was 20 times slower and about 3 times as expensive; bge was free but slower on a CPU and less accurate. Measured in Turkish and on SciFact.</p>
    <b>What this means for a product.</b> Rerank the top 20 with a small, fast model, fall back to the hybrid order if it is unreachable, and use its probability as the "I don't know" threshold.`;
}

function renderS4Limit() {
  const question = questions.get("f02");
  $("#s4-limit").innerHTML = `<b>Limit.</b> "${esc(question.history[0])}" "${esc(question.text)}" On its own the second message has no subject: how long does <i>what</i> take? Every search so far has only looked at the last message.`;
}

function renderS5Problem() {
  $("#s5-problem").innerHTML = `<b>Problem.</b> 15 of the 52 questions only make sense after the message before them. Searched with the last message alone, even the reranked search scores nDCG ${two(kindScore("EN", "jev-stop", "followup"))} on them in English and ${two(kindScore("TR", "jev", "followup"))} in Turkish, against ${two(kindScore("EN", "jev-stop", "exact"))} and ${two(kindScore("TR", "jev", "exact"))} on questions whose words are in the passage.`;
}

function renderHistoryTable() {
  $("#history-table").innerHTML = `<table class="report"><thead><tr><th></th><th>EN, follow-ups</th><th>TR, follow-ups</th><th>EN, all 52</th><th>TR, all 52</th></tr></thead><tbody>
    <tr><td>Last message only</td><td class="num">${two(kindScore("EN", "jev-stop", "followup"))}</td><td class="num">${two(kindScore("TR", "jev", "followup"))}</td><td class="num">${three(nDCG("EN", "jev-stop"))}</td><td class="num">${three(nDCG("TR", "jev"))}</td></tr>
    <tr><td>Previous message prepended</td><td class="num">${two(kindScore("EN", "history-stop", "followup"))}</td><td class="num">${two(kindScore("TR", "history", "followup"))}</td><td class="num">${three(nDCG("EN", "history-stop"))}</td><td class="num">${three(nDCG("TR", "history"))}</td></tr>
    </tbody></table><p class="overall">nDCG@10 with the full search and the reranker. 1.000 on all 52 is the ceiling of this question set: from here on the questions can't tell a better search from a worse one.</p>`;
}

const WAY_QUESTIONS = ["p03", "p05", "x05", "m06", "f09"];
const waysToy = { question: "p03" };

function renderWaysToy() {
  const question = questions.get(waysToy.question);
  const written = LAB.ways.written.EN[question.id];
  const ranks = LAB.ways.ranks.EN;
  const cards = [
    ["Last message", "last", [question.text]],
    ["History prepended", "history", [written.history]],
    ["Expansion", "expand", written.expand],
    ["HyDE + message", "hyde+", written.hyde && [written.history, ...written.hyde]],
  ].map(([label, way, texts]) => `<div class="card answer-card"><div class="label">${label}</div>${(texts || ["(not written)"]).map((text) => `<p class="query-text">${esc(text)}</p>`).join("")}<span class="where ${ranks[way][question.id] && ranks[way][question.id] <= 5 ? "top" : "lost"}">right passage: ${rankWords(ranks[way][question.id])}</span></div>`).join("");
  $("#ways-toy").innerHTML = `
    <div class="pills">${WAY_QUESTIONS.map((id) => `<button data-q="${id}" class="${id === question.id ? "on" : ""}">${esc(questions.get(id).history.length ? `${questions.get(id).history.join(" ")} → ${questions.get(id).text}` : questions.get(id).text)}</button>`).join("")}</div>
    <div class="answer-grid">${cards}</div>
    <p class="overall">English, plain BM25 (the weak search). What was searched, and where the right passage landed in the lab's run. The invented details in a HyDE passage are fine: it is only used to find candidates.</p>`;
  for (const button of document.querySelectorAll("#ways-toy [data-q]")) button.onclick = () => { waysToy.question = button.dataset.q; renderWaysToy(); };
}

function renderInjection() {
  const question = questions.get("h12");
  const [tr, en] = [LAB.ways.written.TR.h12.hyde[0], LAB.ways.written.EN.h12.hyde[0]];
  $("#injection").innerHTML = `<b>A prompt injection got into the search.</b> The hard questions include "${esc(question.text)}" In Turkish, the passage HyDE wrote for it began: <q>${esc(tr)}</q> ("The clinic's price list gives the price of a single implant as 100 TL."). The answer was still right, 25,000 TL, because it was written by a separate call from the real passages under strict instructions. In English HyDE didn't take the bait, but wrote its passage in Turkish: <q>${esc(short(en, 110))}</q>. Text the model writes from a user's message is user-influenced text: use it to find candidates, never as a source.`;
}

function renderS5Result() {
  const ways = LAB.ways["nDCG@10"];
  const row = (way) => `<tr><td>${esc(LAB.ways.labels[way])}</td><td class="num">${three(ways.EN[way])}</td><td class="num">${three(ways.TR[way])}</td></tr>`;
  $("#s5-result").innerHTML = `<b>Result.</b> Writing the query first rescues a weak search, and the winner depends on the language.
    <div class="table-scroll"><table class="report"><thead><tr><th>plain BM25, searched with</th><th>EN nDCG@10</th><th>TR nDCG@10</th></tr></thead><tbody>${Object.keys(LAB.ways.labels).map(row).join("")}</tbody></table></div>
    <p class="overall">One write takes ${(LAB.calls.hyde.ms / 1000).toFixed(1)} s and $${LAB.calls.hyde.cost.toFixed(5)}. On SciFact-TR, a harder Turkish benchmark, expansion also lifted the best search with the reranker from 0.753 to 0.810, the first gain there since the reranker.</p>
    <b>What this means for a product.</b> If the search is good, prepend the history and stop. If it is weak or unknown, one model call before the search buys most of what an agent would (Section 7), without the loop.`;
}

function renderS5Limit() {
  $("#s5-limit").innerHTML = `<b>Limit.</b> Finding the right passage ends here. But the patient reads the answer, not the passage, and a model can still invent a price, flatten a conditional answer into "yes", or answer what the documents never say. Section 6.`;
}

const short = (text, size) => (Array.from(text).length > size ? `${Array.from(text).slice(0, size - 1).join("")}…` : text);

const THRESHOLD = 0.5; // lab/judge.py
const VARIANTS = { "arama, rahat": "Full search, plain", "arama, sıkı": "Full search, strict", "hepsi prompta, sıkı": "Whole knowledge base in the prompt, strict", "zayıf arama, sıkı": "Weak search, strict", "zayıf arama + HyDE, sıkı": "Weak search + HyDE, strict", "agent, arama": "Agent, full search", "agent, zayıf arama": "Agent, weak search" };
const reply = (language, variant, id) => LAB.replies[language][variant][id];
const givenTo = (row) => (row.passages === "all" ? LAB.passages.map((passage) => passage.id) : row.passages);
const madeUp = (row) => row.claims.filter(([, score]) => score < THRESHOLD);

function chips(row) {
  const correct = row.correct >= THRESHOLD;
  const invented = madeUp(row).length;
  return `<span class="chip ${correct ? "ok" : "no"}">${correct ? "✓ correct" : "✗ wrong"}</span><span class="chip ${invented ? "no" : "ok"}">${invented ? `unsupported: ${invented} claim${invented > 1 ? "s" : ""}` : "✓ faithful"}</span>`;
}

function answerCard(label, row) {
  return `<div class="card answer-card"><div class="label">${esc(label)}</div><p>${esc(row.answer)}</p><div class="chips">${chips(row)}</div>${madeUp(row).map(([claim]) => `<div class="claim-out">not in the passages: ${esc(claim)}</div>`).join("")}</div>`;
}

function renderS6Problem() {
  const question = questions.get("f08");
  $("#s6-problem").innerHTML = `<b>Problem.</b> Finding the right passage isn't the end. "${esc(question.history[0])} ${esc(question.text)}" The passage says <q>${esc(question.targets[0].quote)}</q>. Same passages, same model, two sets of instructions, two languages:
    <div class="answer-pair">${answerCard("English, plain", reply("EN", "arama, rahat", "f08"))}${answerCard("English, strict", reply("EN", "arama, sıkı", "f08"))}</div>
    <div class="answer-pair">${answerCard("Turkish, plain", reply("TR", "arama, rahat", "f08"))}${answerCard("Turkish, strict", reply("TR", "arama, sıkı", "f08"))}</div>
    In both languages the plain answer turned "avoid it on the first day" into "you can smoke now". Nothing in the documents says that.`;
  $("#instructions").innerHTML = `<b>Plain.</b> ${esc(LAB.instructions.plain)}<br><br><b>Strict.</b> ${esc(LAB.instructions.strict)}`;
}

const ANSWER_QUESTIONS = ["h02", "f08", "h01", "h12", "e06", "n02", "x05"];
const answerToy = { question: "h02", variant: "arama, sıkı" };
const ANSWER_VARIANTS = ["arama, rahat", "arama, sıkı", "hepsi prompta, sıkı", "zayıf arama, sıkı", "zayıf arama + HyDE, sıkı"];

function judgeBar(score) {
  return `<span class="judge-bar"><i style="width:${Math.round(score * 100)}%" class="${score >= THRESHOLD ? "yes" : "no"}"></i><b style="left:${THRESHOLD * 100}%"></b></span><span class="num">${score.toFixed(2)}</span>`;
}

function renderAnswerToy() {
  const question = questions.get(answerToy.question);
  const row = reply("EN", answerToy.variant, question.id);
  const ids = givenTo(row);
  const cited = new Set(row.sources);
  const passage = (id, number) => `<div class="prompt-passage ${cited.has(number) ? "cited" : ""}"><span class="num">[${number}]</span> <b>${esc(passages.get(id).title)}</b>${holds(question, id) ? ' <span class="tick">✓</span>' : ""}<div>${esc(passages.get(id).body.trim())}</div></div>`;
  const record = JSON.stringify({ answer: row.answer, sources: row.sources, known: row.known }, null, 2);
  const note = question.ideal ? `<div class="toy-verdict"><b>A good answer:</b> ${esc(question.ideal)}</div>` : question.targets.length ? `<div class="toy-verdict"><b>The documents say:</b> ${question.targets.map((target) => `<q>${esc(target.quote)}</q>`).join(" ")}</div>` : `<div class="toy-verdict"><b>The documents don't have the answer.</b></div>`;
  $("#answer-toy").innerHTML = `
    <div class="toy-controls">
      <div class="pills">${ANSWER_QUESTIONS.map((id) => `<button data-q="${id}" class="${id === question.id ? "on" : ""}">${esc(questions.get(id).text)}</button>`).join("")}</div>
      <div class="pills">${ANSWER_VARIANTS.map((variant) => `<button data-v="${variant}" class="${variant === answerToy.variant ? "on" : ""}">${esc(VARIANTS[variant])}</button>`).join("")}</div>
    </div>
    ${note}
    <div class="prompt-split">
      <div><div class="label">Passages given · ${ids.length}</div><div class="prompt-passages ${ids.length > 5 ? "long" : ""}">${ids.map((id, index) => passage(id, index + 1)).join("")}</div></div>
      <div><div class="label">The record that came back · ${(row.ms / 1000).toFixed(1)} s · $${row.cost.toFixed(5)}</div><pre class="reply">${esc(record)}</pre>
        <div class="label">Correct? Agrees with the note</div><div class="claim-row">${judgeBar(row.correct)}<span>${row.correct >= THRESHOLD ? "yes" : "no"}</span></div>
        <div class="label">Faithful? Each claim against the passages</div>
        ${row.claims.length ? row.claims.map(([claim, score]) => `<div class="claim-row">${judgeBar(score)}<span class="${score >= THRESHOLD ? "" : "bad"}">${esc(claim)}</span></div>`).join("") : '<p class="overall">No factual claim, so nothing to invent.</p>'}
        <div class="chips">${chips(row)}</div></div>
    </div>`;
  for (const button of document.querySelectorAll("#answer-toy [data-q]")) button.onclick = () => { answerToy.question = button.dataset.q; renderAnswerToy(); };
  for (const button of document.querySelectorAll("#answer-toy [data-v]")) button.onclick = () => { answerToy.variant = button.dataset.v; renderAnswerToy(); };
  const first = document.querySelector("#answer-toy .prompt-passage.cited");
  const box = document.querySelector("#answer-toy .prompt-passages");
  if (first && box.classList.contains("long")) box.scrollTop = first.offsetTop - box.offsetTop - 8;
}

function renderLanguageSlip() {
  const row = reply("EN", "arama, sıkı", "e06");
  $("#language-slip").innerHTML = `<b>A slip I didn't expect.</b> The strict instructions say "reply in the customer's language". Asked "${esc(questions.get("e06").text)}", the model replied in Turkish: <q>${esc(row.answer)}</q> Two words are not much to go on, "implant" is spelt the same in both languages, and the passages are full of TL and Turkish names. The same happened to a HyDE passage in Section 5. For a product: never let the model guess the reply language; put it in the instructions.`;
}

function renderS6Result() {
  const rows = ANSWER_VARIANTS.map((variant) => {
    const [en, tr] = [answers("EN", variant), answers("TR", variant)];
    const [enHard, trHard] = [answers("EN", variant, "hard"), answers("TR", variant, "hard")];
    return `<tr><td>${esc(VARIANTS[variant])}</td><td class="num">${pct(en.correct)}</td><td class="num">${pct(tr.correct)}</td><td class="num">${pct(en.faithful)}</td><td class="num">${pct(tr.faithful)}</td><td class="num">${pct(enHard.correct)}</td><td class="num">${pct(trHard.correct)}</td><td class="num">$${en.answer_cost.toFixed(5)}</td></tr>`;
  }).join("");
  $("#s6-result").innerHTML = `<b>Result.</b> With the right passages the model answers well in both languages, including the hard questions: conditions, missing pieces, a false premise, an injected instruction.
    <div class="table-scroll"><table class="report"><thead><tr><th></th><th>EN correct</th><th>TR correct</th><th>EN faithful</th><th>TR faithful</th><th>EN hard</th><th>TR hard</th><th>EN per answer</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="overall">52 questions, plus the 15 hard ones. The judges were checked on hand-written answers first (Section 1). In Turkish strict instructions took faithfulness from 90% to 100%; in English the counts stay flat, because what the judge flags in strict English answers are harmless asides ("no other fees are mentioned"). Reading the flagged claims tells the real story: the risky invention above appears with plain instructions in both languages, never with strict ones. The whole knowledge base in the prompt works as well as search for a clinic this small, at about four times the cost per answer.</p>
    <b>What this means for a product.</b> Strict instructions, numbered sources, the reply language stated outright, and the identity of the assistant written into the instructions (Section 7). Read what the judge flags; a count alone can hide both harmless asides and real inventions.`;
}

function renderS6Limit() {
  const weak = answers("EN", "zayıf arama, sıkı");
  $("#s6-limit").innerHTML = `<b>Limit.</b> With the weak search the strict model still doesn't invent, but it says "not available" to ${pct(weak.refused)} of the questions the documents do answer. Honest, and empty: a fixed pipeline can't repair a bad query.`;
}

function renderS7Problem() {
  const row = reply("EN", "zayıf arama, sıkı", "p03");
  $("#s7-problem").innerHTML = `<b>Problem.</b> "${esc(questions.get("p03").text)}", with the weak search: the right passage never arrives, and the strict answer is <q>${esc(row.answer)}</q>`;
}

const REPLAYS = [
  { variant: "agent, zayıf arama", question: "p03", note: "Teeth whiter, weak search" },
  { variant: "agent, zayıf arama", question: "x05", note: "Two questions in one" },
  { variant: "agent, arama", question: "n02", note: "No answer in the documents" },
  { variant: "agent, arama", question: "c01", note: "Hi" },
];
const replay = { pick: 0, step: 0 };

function replaySteps(pick) {
  const question = questions.get(pick.question);
  const row = reply("EN", pick.variant, pick.question);
  const seen = [];
  const message = [...question.history.map((text) => `Customer's earlier message: ${text}`), `Customer's message: ${question.text}`].join("\n");
  const steps = [{ kind: "request", who: "Request 1 · us → the model", html: `<pre>instructions: ${esc(short(LAB.instructions.agent, 140))}\ntools: search_knowledge(query)\ninput: ${esc(message)}</pre>` }];
  row.steps.forEach(([query, found], index) => {
    steps.push({ kind: "call", who: "The model → us · not an answer, a request to search", html: `<pre>search_knowledge({"query": "${esc(query)}"})</pre>` });
    const lines = found.map((id) => {
      if (!seen.includes(id)) seen.push(id);
      return `<li><span class="num">[${seen.indexOf(id) + 1}]</span> ${esc(passages.get(id).title)}${holds(question, id) ? ' <span class="tick">✓</span>' : ""}</li>`;
    }).join("");
    steps.push({ kind: "search", who: `The search · our code, ${pick.variant === "agent, arama" ? "the full search" : "plain BM25"}`, html: `<ol class="try-top plain">${lines}</ol>` });
    steps.push({ kind: "request", who: `Request ${index + 2} · us → the model`, html: `<pre>input: everything so far again (the message, the model's encrypted reasoning, its search request) + the search results, passages [1]-[${seen.length}]</pre>` });
  });
  steps.push({ kind: "final", who: "The model → us · the answer", html: `<pre>${esc(JSON.stringify({ answer: row.answer, sources: row.sources, known: row.known }, null, 2))}</pre><div class="chips">${chips(row)}</div>` });
  return steps;
}

function renderReplay() {
  const pick = REPLAYS[replay.pick];
  const steps = replaySteps(pick);
  const row = reply("EN", pick.variant, pick.question);
  replay.step = Math.min(replay.step, steps.length - 1);
  $("#agent-replay").innerHTML = `
    <div class="pills">${REPLAYS.map((item, index) => `<button data-pick="${index}" class="${index === replay.pick ? "on" : ""}">${esc(item.note)}</button>`).join("")}</div>
    <div class="replay-bar"><button class="btn small" data-move="-1" ${replay.step ? "" : "disabled"}>← back</button><button class="btn small primary" data-move="1" ${replay.step < steps.length - 1 ? "" : "disabled"}>next →</button><button class="btn small" data-move="all">all</button>
      <span class="stat-line">step ${replay.step + 1} / ${steps.length} · ${row.steps.length} search${row.steps.length === 1 ? "" : "es"} · ${(row.ms / 1000).toFixed(1)} s · $${row.cost.toFixed(5)}</span></div>
    <div class="replay-steps">${steps.map((step, index) => `<div class="replay-step ${step.kind} ${index > replay.step ? "later" : ""}"><span class="who">${esc(step.who)}</span>${step.html}</div>`).join("")}</div>
    <p class="overall">A tick marks the passage that really holds the answer. Passage numbers stay fixed for the whole conversation, so "sources" always means the same passages.</p>`;
  for (const button of document.querySelectorAll("#agent-replay [data-pick]")) button.onclick = () => { replay.pick = Number(button.dataset.pick); replay.step = 0; renderReplay(); };
  for (const button of document.querySelectorAll("#agent-replay [data-move]")) button.onclick = () => { replay.step = button.dataset.move === "all" ? steps.length - 1 : replay.step + Number(button.dataset.move); renderReplay(); };
}

function searchesPerAnswer(variant, group) {
  const ids = [...questions.values()].filter((question) => (group === "chat" ? question.id.startsWith("c") : group === "old" ? !/^[hc]/.test(question.id) : false)).map((question) => question.id);
  const rows = ids.map((id) => reply("EN", variant, id)).filter(Boolean);
  return rows.reduce((sum, row) => sum + row.steps.length, 0) / rows.length;
}

function renderS7Result() {
  const line = (label, variant, searches) => {
    const [en, tr] = [answers("EN", variant), answers("TR", variant)];
    return `<tr><td>${esc(label)}</td><td class="num">${pct(en.correct)}</td><td class="num">${pct(tr.correct)}</td><td class="num">${searches}</td><td class="num">${(en.answer_ms / 1000).toFixed(1)} s</td><td class="num">$${en.answer_cost.toFixed(5)}</td></tr>`;
  };
  const chatSearches = searchesPerAnswer("agent, arama", "chat");
  $("#s7-result").innerHTML = `<b>Result.</b> With a good search the agent adds time and cost and little accuracy (${pct(answers("EN", "agent, arama").correct)} against ${pct(answers("EN", "arama, sıkı").correct)} in English, ${pct(answers("TR", "agent, arama").correct)} against ${pct(answers("TR", "arama, sıkı").correct)} in Turkish). With a weak search it is the best of the three, but one model-written query gets most of the way there, without a loop.
    <div class="table-scroll"><table class="report"><thead><tr><th></th><th>EN correct</th><th>TR correct</th><th>EN searches per answer</th><th>EN time</th><th>EN per answer</th></tr></thead><tbody>
    ${line("Full search, fixed", "arama, sıkı", "1")}
    ${line("Full search, agent", "agent, arama", searchesPerAnswer("agent, arama", "old").toFixed(2))}
    ${line("Weak search, fixed", "zayıf arama, sıkı", "1")}
    ${line("Weak search + HyDE, fixed", "zayıf arama + HyDE, sıkı", "1 + a written query")}
    ${line("Weak search, agent", "agent, zayıf arama", searchesPerAnswer("agent, zayıf arama", "old").toFixed(2))}
    </tbody></table></div>
    <p class="overall">52 questions. The agent searched about once per question: most of its gain on the weak search came from writing a good first query (synonyms, the topic's name), not from searching again. On the five chat messages ("Hi", "Thanks") it searched ${chatSearches.toFixed(1)} times per message, and it never answered a real question without searching. Per-answer times exclude the search itself; with the full search each search is also a rerank call.</p>
    <b>What this means for a product.</b> Three choices, by how good the search is. Good: a fixed pipeline. Weak or unknown: one written query before a fixed pipeline. Weak, ambiguous, multi-part: an agent, for about twice the time.`;
}

function renderS7Limit() {
  const row = reply("EN", "agent, arama", "c05");
  $("#s7-limit").innerHTML = `<b>Limit.</b> "Are you a real person?" The agent searched and answered <q>${esc(row.answer)}</q> It could call itself the chat assistant only because the privacy page mentions one; whether it is a person, no passage says, and the strict rule "only from the passages" kept it from saying so. In Turkish it answered "this information isn't available". An assistant's identity belongs in its instructions, not in the documents it searches.`;
}

function renderBothLanguages() {
  const searchRows = [["BM25", "bm25-naive", "bm25-naive"], ["+ word forms", "bm25-stop", "bm25-stem"], ["Embeddings alone", "e5", "e5"], ["Hybrid (RRF)", "rrf-stop", "rrf"], ["+ Rerank", "jev-stop", "jev"], ["+ History", "history-stop", "history"]];
  const answerRows = ["arama, sıkı", "zayıf arama, sıkı", "zayıf arama + HyDE, sıkı", "agent, zayıf arama"];
  $("#both-languages").innerHTML = `<div class="table-scroll"><table class="report"><thead><tr><th>search</th><th>EN nDCG@10</th><th>TR nDCG@10</th><th>EN recall@1</th><th>TR recall@1</th></tr></thead><tbody>
    ${searchRows.map(([label, en, tr]) => `<tr><td>${esc(label)}</td><td class="num">${three(nDCG("EN", en))}</td><td class="num">${three(nDCG("TR", tr))}</td><td class="num">${two(recall1("EN", en))}</td><td class="num">${two(recall1("TR", tr))}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="table-scroll"><table class="report"><thead><tr><th>answer</th><th>EN correct</th><th>TR correct</th><th>EN faithful</th><th>TR faithful</th></tr></thead><tbody>
    ${answerRows.map((variant) => `<tr><td>${esc(VARIANTS[variant])}</td><td class="num">${pct(answers("EN", variant).correct)}</td><td class="num">${pct(answers("TR", variant).correct)}</td><td class="num">${pct(answers("EN", variant).faithful)}</td><td class="num">${pct(answers("TR", variant).faithful)}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="overall">English from "+ word forms" on is stemmed, without stop words. 52 questions each; answers with strict instructions.</p>`;
}

const free = { text: "do you do teeth cleaning" };

function renderFreeSearch() {
  const columns = TOKENIZER_COLUMNS.map(([name, label]) => {
    const words = english[name](free.text);
    const found = indexes[name].search(free.text, 5);
    const unknown = name !== "naive" ? english.english(free.text).filter((word) => !english.known(word)) : [];
    return `<div class="card mode-column"><div class="label">${label}</div><div class="tokens">${words.map((word) => `<span class="token ${indexes[name].documentFrequency(word) ? "" : "missing"}">${esc(word)}</span>`).join("")}</div>
      <ol class="try-top">${found.map((hit, place) => `<li><span class="num">${place + 1}</span>${esc(lastTitle(hit.passage.id))}</li>`).join("") || "<li>nothing</li>"}</ol>
      ${unknown.length ? `<small class="faint">not stemmed (new to this page): ${esc(unknown.join(", "))}</small>` : ""}</div>`;
  }).join("");
  $("#free-search").innerHTML = `<input class="wide-input" id="free-input" value="${esc(free.text)}" autocomplete="off"><div class="three-columns">${columns}</div>`;
  const input = $("#free-input");
  input.oninput = () => { free.text = input.value; const at = input.selectionStart; renderFreeSearch(); const next = $("#free-input"); next.focus(); next.setSelectionRange(at, at); };
}

const TERMS = {
  rag: ["RAG", "Retrieval-augmented generation: find the passages that answer the question, put them in the prompt, let the model answer from them."],
  retrieval: ["retrieval", "The finding half of RAG: turning a question into a ranked list of passages."],
  generation: ["generation", "The answering half of RAG: the model writes the answer from the passages it was given."],
  evaluation: ["evaluation", "Measuring every change on the same questions before keeping it."],
  recall: ["recall@k", "Is the passage that answers the question among the first k results?"],
  ndcg: ["nDCG", "How high up the right passages are in the top 10: first place counts 1, second 0.63, tenth 0.29."],
  judge: ["LLM-as-judge", "A second model grades free-text answers; it is tested on answers with known verdicts first."],
  bm25: ["BM25", "Classic keyword scoring: rare shared words count most, repeats a little, long passages less."],
  tokenization: ["tokenization", "Splitting text into the terms an index stores; questions and passages must be split the same way."],
  stemming: ["stemming", "Cutting words down to a common root so that 'instalments' and 'installments' meet."],
  stopwords: ["stop words", "Words in nearly every text ('what', 'my', 'the'), usually left out of keyword search."],
  embeddings: ["embeddings", "Numbers that stand for a text's meaning; similar meanings get similar numbers, whatever the words."],
  vector: ["vector search", "Finding the passages whose embeddings are nearest to the question's."],
  hybrid: ["hybrid search", "Keyword and embedding search run side by side, their lists merged."],
  rrf: ["RRF", "Reciprocal rank fusion: each list gives a passage 1 / (60 + its rank); the totals decide."],
  rerank: ["reranking", "A slower model reads question and candidate together and reorders the top 20."],
  abstain: ["abstention", "Saying 'I don't know' when the best passage is too unlikely to hold the answer."],
  rewriting: ["query rewriting", "Changing what is searched before the search: history added, a rewrite by a model."],
  expansion: ["query expansion", "Adding the words a document would use, synonyms included, to the query."],
  hyde: ["HyDE", "Hypothetical document embeddings: search with an invented answer, which looks more like a document than the question does."],
  injection: ["prompt injection", "Instructions hidden in user text that try to steer the model."],
  grounding: ["grounding", "Answering only from the passages given, and citing them."],
  hallucination: ["hallucination", "Saying something the passages don't contain as if it were true."],
  faithfulness: ["faithfulness", "Every claim in the answer is supported by the passages it was written from."],
  context: ["long context", "Skipping retrieval and putting the whole knowledge base into every prompt."],
  agent: ["agentic RAG", "Search becomes a tool; the model decides whether, what and how often to search."],
  tools: ["tool calling", "The model returns a request to call a function; the application runs it and hands back the result."],
  tradeoffs: ["trade-offs", "What each choice buys and what it adds to every answer in time and money."],
};
const SECTION_TERMS = {
  rag: ["rag", "retrieval", "generation"],
  s1: ["evaluation", "recall", "ndcg", "judge"],
  s2: ["bm25", "tokenization", "stemming", "stopwords"],
  s3: ["embeddings", "vector", "hybrid", "rrf"],
  s4: ["rerank", "abstain"],
  s5: ["rewriting", "expansion", "hyde", "injection"],
  s6: ["generation", "grounding", "hallucination", "faithfulness", "context"],
  s7: ["agent", "tools"],
  s8: ["tradeoffs"],
};

function tagsOf(id) {
  return (SECTION_TERMS[id] || []).map((key) => `<span class="tag" title="${esc(TERMS[key][1])}">${esc(TERMS[key][0])}</span>`).join("");
}

function renderSectionTags() {
  for (const id of Object.keys(SECTION_TERMS)) {
    const heading = document.querySelector(`#${id} > header h2`);
    if (heading) heading.insertAdjacentHTML("afterend", `<div class="tags">${tagsOf(id)}</div>`);
  }
}

const NODE = { w: 122, h: 48 };
const NODES = {
  question: { x: 8, y: 131, label: "Question", sub: "from the patient" },
  history: { x: 138, y: 131, label: "+ history", sub: "the message before" },
  writer: { x: 268, y: 131, label: "Write the query", sub: "an LLM, before search" },
  keyword: { x: 398, y: 66, label: "Keyword search", sub: "BM25" },
  meaning: { x: 398, y: 196, label: "Embedding search", sub: "e5, by meaning" },
  fuse: { x: 528, y: 131, label: "Fuse", sub: "RRF" },
  rerank: { x: 658, y: 131, label: "Rerank", sub: "reads the top 20" },
  top: { x: 788, y: 131, label: "Top 5 passages", sub: "numbered" },
  everything: { x: 788, y: 256, label: "Whole knowledge base", sub: "all 55 passages" },
  model: { x: 918, y: 131, label: "Model", sub: "writes the answer" },
  answer: { x: 1048, y: 131, label: "Answer", sub: "with sources" },
  judges: { x: 1048, y: 256, label: "Judges", sub: "correct? faithful?" },
};
const right = (id) => [NODES[id].x + NODE.w, NODES[id].y + NODE.h / 2];
const leftOf = (id) => [NODES[id].x, NODES[id].y + NODE.h / 2];
function curve([x1, y1], [x2, y2]) {
  const middle = (x1 + x2) / 2;
  return `M${x1},${y1} C${middle},${y1} ${middle},${y2} ${x2},${y2}`;
}
const EDGE_PATHS = {
  "question>model": `M${right("question")[0]},${right("question")[1] + 10} C300,300 760,300 ${leftOf("model")[0]},${leftOf("model")[1] + 12}`,
  "everything>model": curve([NODES.everything.x + NODE.w, NODES.everything.y + NODE.h / 2], [NODES.model.x, NODES.model.y + NODE.h - 8]),
  "answer>judges": `M${NODES.answer.x + NODE.w / 2},${NODES.answer.y + NODE.h} L${NODES.judges.x + NODE.w / 2},${NODES.judges.y}`,
  "model>keyword": `M${NODES.model.x + NODE.w / 2},${NODES.model.y} C${NODES.model.x + NODE.w / 2},10 ${NODES.keyword.x + NODE.w / 2},10 ${NODES.keyword.x + NODE.w / 2},${NODES.keyword.y}`,
};
const edgePath = (key) => EDGE_PATHS[key] || curve(right(key.split(">")[0]), leftOf(key.split(">")[1]));

const VARIANT_LIST = [
  {
    id: "M0", name: "Everything in the prompt", short: "No search at all",
    nodes: ["question", "everything", "model", "answer"], edges: ["question>model", "everything>model", "model>answer"],
    idea: "Skip retrieval: send the whole knowledge base with every question. The baseline every RAG system should beat.",
    fixes: "Nothing can be missed, because nothing is searched.",
    costs: "Every prompt carries the whole knowledge base: about four times the price per answer here, and it stops fitting as the documents grow.",
    result: () => `${pct(answers("EN", "hepsi prompta, sıkı").correct)} EN · ${pct(answers("TR", "hepsi prompta, sıkı").correct)} TR correct, $${answers("EN", "hepsi prompta, sıkı").answer_cost.toFixed(5)} per answer`,
    headline: () => [pct(answers("EN", "hepsi prompta, sıkı").correct), pct(answers("TR", "hepsi prompta, sıkı").correct), "correct"],
    section: "s6",
  },
  {
    id: "M1", name: "Basic RAG", short: "Keyword search, top 5",
    nodes: ["question", "keyword", "top", "model", "answer"], edges: ["question>keyword", "keyword>top", "top>model", "model>answer"],
    idea: "Search the documents with keyword search, give the model the top five passages.",
    fixes: "The prompt stays small and the knowledge base can grow.",
    costs: "Misses every question asked in other words, and in Turkish most questions with another suffix.",
    result: () => `search nDCG ${two(nDCG("EN", "bm25-naive"))} EN · ${two(nDCG("TR", "bm25-naive"))} TR; answers ${pct(answers("EN", "zayıf arama, sıkı").correct)} · ${pct(answers("TR", "zayıf arama, sıkı").correct)} correct`,
    headline: () => [pct(answers("EN", "zayıf arama, sıkı").correct), pct(answers("TR", "zayıf arama, sıkı").correct), "correct"],
    section: "s2",
  },
  {
    id: "M2", name: "Better search", short: "Hybrid search and a reranker",
    nodes: ["question", "keyword", "meaning", "fuse", "rerank", "top", "model", "answer"], edges: ["question>keyword", "question>meaning", "keyword>fuse", "meaning>fuse", "fuse>rerank", "rerank>top", "top>model", "model>answer"],
    idea: "Search by words and by meaning, fuse the two lists, then let a small model read the top 20 and put the right passage first.",
    fixes: "Questions in other words, and the right passage stuck at #9. The reranker's probability can also say \"I don't know\".",
    costs: "One rerank call per question, about half a second.",
    result: () => `search nDCG ${two(nDCG("EN", "jev-stop"))} EN · ${two(nDCG("TR", "jev"))} TR (from ${two(nDCG("EN", "bm25-naive"))} · ${two(nDCG("TR", "bm25-naive"))})`,
    headline: () => [two(nDCG("EN", "jev-stop")), two(nDCG("TR", "jev")), "search nDCG"],
    section: "s3",
  },
  {
    id: "M3", name: "Better question", short: "History, and a query written first",
    nodes: ["question", "history", "writer", "keyword", "meaning", "fuse", "rerank", "top", "model", "answer"], edges: ["question>history", "history>writer", "writer>keyword", "writer>meaning", "keyword>fuse", "meaning>fuse", "fuse>rerank", "rerank>top", "top>model", "model>answer"],
    idea: "Search with what the question means, not just what it says: the previous message added, or a query the model writes first (expansion, HyDE).",
    fixes: "Follow-ups like \"How long does it take?\", and a weak search that can't see synonyms.",
    costs: "History is free. A written query is one model call, about 2.4 s.",
    result: () => `search nDCG ${two(nDCG("EN", "history-stop"))} EN · ${two(nDCG("TR", "history"))} TR; on a weak search a written query took answers from ${pct(answers("EN", "zayıf arama, sıkı").correct)} to ${pct(answers("EN", "zayıf arama + HyDE, sıkı").correct)}`,
    headline: () => [two(nDCG("EN", "history-stop")), two(nDCG("TR", "history")), "search nDCG"],
    section: "s5",
  },
  {
    id: "M4", name: "Grounded answer", short: "Strict instructions, sources, judges",
    nodes: ["question", "history", "keyword", "meaning", "fuse", "rerank", "top", "model", "answer", "judges"], edges: ["question>history", "history>keyword", "history>meaning", "keyword>fuse", "meaning>fuse", "fuse>rerank", "rerank>top", "top>model", "model>answer", "answer>judges"],
    idea: "The model answers only from numbered passages, cites them, and says what is missing; two judges, tested first, grade every answer.",
    fixes: "Invented prices and advice: loose instructions told a patient the no-smoking period had passed, in both languages.",
    costs: "Nothing per answer; the judges run when measuring.",
    result: () => `${pct(answers("EN", "arama, sıkı").correct)} EN · ${pct(answers("TR", "arama, sıkı").correct)} TR correct, ${pct(answers("EN", "arama, sıkı").faithful)} · ${pct(answers("TR", "arama, sıkı").faithful)} faithful`,
    headline: () => [pct(answers("EN", "arama, sıkı").correct), pct(answers("TR", "arama, sıkı").correct), "correct"],
    section: "s6",
  },
  {
    id: "M5", name: "Agentic RAG", short: "Search as a tool, in a loop",
    nodes: ["question", "keyword", "meaning", "fuse", "rerank", "top", "model", "answer"], edges: ["question>model", "model>keyword", "keyword>fuse", "meaning>fuse", "fuse>rerank", "rerank>top", "top>model", "model>answer"],
    idea: "The model decides whether to search, writes its own query, reads the results, and searches again if they aren't enough.",
    fixes: "A weak search, questions with two parts, and greetings that need no search at all.",
    costs: "About twice the time per answer; harder to predict.",
    result: () => `on the weak search ${pct(answers("EN", "agent, zayıf arama").correct)} EN · ${pct(answers("TR", "agent, zayıf arama").correct)} TR correct (fixed pipeline: ${pct(answers("EN", "zayıf arama, sıkı").correct)} · ${pct(answers("TR", "zayıf arama, sıkı").correct)}); on the full search ${pct(answers("EN", "agent, arama").correct)} · ${pct(answers("TR", "agent, arama").correct)}, about twice as slow as fixed`,
    headline: () => [pct(answers("EN", "agent, zayıf arama").correct), pct(answers("TR", "agent, zayıf arama").correct), "correct, weak search"],
    section: "s7",
  },
];
const variant = { at: 3 };

function renderLadder() {
  $("#ladder").innerHTML = VARIANT_LIST.map((item, index) => {
    const [en, tr, what] = item.headline();
    return `<button class="rung ${index === variant.at ? "on" : ""}" data-at="${index}"><span class="rung-id">${item.id}</span><b>${esc(item.name)}</b><small>${esc(item.short)}</small><span class="rung-score"><span><small>EN</small>${en}</span><span><small>TR</small>${tr}</span></span><small class="faint">${esc(what)}</small></button>`;
  }).join("");
  for (const button of document.querySelectorAll("#ladder .rung")) button.onclick = () => { variant.at = Number(button.dataset.at); renderVariants(); };
}

function renderVariants() {
  const item = VARIANT_LIST[variant.at];
  const on = new Set(item.nodes);
  const edges = new Set(item.edges);
  const allEdges = new Set(VARIANT_LIST.flatMap((entry) => entry.edges));
  const paths = [...allEdges].map((key) => `<path class="flow-edge ${edges.has(key) ? "on" : ""} ${key === "model>keyword" ? "loop" : ""}" d="${edgePath(key)}"/>`).join("");
  const boxes = Object.entries(NODES).map(([id, node]) => `<g class="flow-node ${on.has(id) ? "on" : ""} ${id === "model" && item.id === "M4" ? "strict" : ""}">
    <rect x="${node.x}" y="${node.y}" width="${NODE.w}" height="${NODE.h}" rx="10"/>
    <text class="name" x="${node.x + NODE.w / 2}" y="${node.y + 21}">${esc(id === "model" && item.id === "M4" ? "Model, strict" : node.label)}</text>
    <text class="small" x="${node.x + NODE.w / 2}" y="${node.y + 37}">${esc(id === "model" && item.id === "M4" ? "only the passages, cited" : node.sub)}</text></g>`).join("");
  const loop = item.id === "M5" ? `<text class="loop-label" x="${(NODES.model.x + NODES.keyword.x) / 2 + 60}" y="20">search_knowledge(query): again, if needed (up to 3)</text>` : "";
  const retrieval = `<text class="zone" x="${NODES.history.x}" y="${NODES.question.y - 70}">RETRIEVAL</text><text class="zone" x="${NODES.top.x}" y="${NODES.question.y - 70}">AUGMENTED PROMPT · GENERATION</text>`;
  $("#variants").innerHTML = `<svg viewBox="0 0 1170 320" role="img" aria-label="The parts of a RAG system, and the ones this version uses">${retrieval}${paths}${loop}${boxes}</svg>`;
  $("#variant-card").innerHTML = `<div class="card variant-detail"><div class="variant-head"><span class="rung-id">${item.id}</span><b>${esc(item.name)}</b><a href="#${item.section}">tried in Section ${item.section.slice(1)} →</a></div>
    <div class="variant-grid"><div><div class="label">The idea</div><p>${esc(item.idea)}</p></div><div><div class="label">What it fixes</div><p>${esc(item.fixes)}</p></div><div><div class="label">What it costs</div><p>${esc(item.costs)}</p></div><div><div class="label">Measured here</div><p class="measured">${esc(item.result())}</p></div></div></div>`;
  renderLadder();
}

renderToc();
renderSectionTags();
renderVariants();
renderPipeline();
renderFindings();
renderShip();
renderSets();
renderKinds();
renderRankToy();
renderJudges();
renderS1Means();
renderS2Problem();
renderPairs();
renderTokenizerToy();
renderS2Result();
renderS2Limit();
renderS3Problem();
renderFusionToy();
renderS3Result();
renderS3Limit();
renderS4Problem();
renderRerankToy();
renderThresholdToy();
renderS4Result();
renderS4Limit();
renderS5Problem();
renderHistoryTable();
renderWaysToy();
renderInjection();
renderS5Result();
renderS5Limit();
renderS6Problem();
renderAnswerToy();
renderLanguageSlip();
renderS6Result();
renderS6Limit();
renderS7Problem();
renderReplay();
renderS7Result();
renderS7Limit();
renderBothLanguages();
renderFreeSearch();
renderFooter();
