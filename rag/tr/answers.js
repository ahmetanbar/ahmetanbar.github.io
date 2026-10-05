"use strict";
// Chapters 9 and 10: answers written from the passages and the judges that grade them (lab lesson 10),
// then search handed to the model as a tool (lab lesson 11).

const ANSWERS = LAB.answers;
const AGENT = LAB.agent;
const anyQuestion = new Map([...LAB.questions, ...ANSWERS.questions, ...AGENT.questions].map((question) => [question.id, question]));
const variantOf = Object.fromEntries(ANSWERS.variants.map((variant) => [variant.id, variant]));
const THRESHOLD = 0.5; // lab/judge.py: Jev's probability at or above which a question counts as yes

const given = (row) => (row.passages === "all" ? ANSWERS.all : row.passages);
const holds = (question, id) => question.targets.some((target) => target.passages.includes(id));
const madeUp = (row) => row.claims.filter(([, score]) => score < THRESHOLD);
const isCorrect = (row) => row.correct >= THRESHOLD;

function chips(row) {
  const invented = madeUp(row).length;
  return `<span class="chip ${isCorrect(row) ? "ok" : "no"}">${isCorrect(row) ? "✓ doğru" : "✗ yanlış"}</span>`
    + `<span class="chip ${invented ? "no" : "ok"}">${invented ? `uydurma: ${invented} iddia` : "✓ sadık"}</span>`;
}

function citedNote(question, row) {
  if (!question.targets.length) return row.known ? "belgelerde var dedi" : "belgelerde yok dedi";
  const ids = given(row);
  const cited = row.sources.map((number) => ids[number - 1]).filter(Boolean);
  if (!cited.length) return "kaynak göstermedi";
  return cited.some((id) => holds(question, id)) ? "kaynağı cevabı içeriyor" : "kaynağı cevabı içermiyor";
}

function answerText(row) {
  let html = esc(row.answer);
  for (const [claim] of madeUp(row)) {
    const plain = claim.replace(/[.]$/, "");
    if (row.answer.includes(plain)) html = html.replace(esc(plain), `<mark class="invented">${esc(plain)}</mark>`);
  }
  return html;
}

function renderAnswerProblem() {
  const question = anyQuestion.get("f08");
  const [plain, strict] = ["arama/plain", "arama/strict"].map((key) => ANSWERS.results[key][question.id]);
  const card = (label, row) => `<div class="card answer-card"><div class="label">${esc(label)}</div><p>${answerText(row)}</p>${madeUp(row).map(([claim]) => `<div class="claim-out">pasajlarda yok: ${esc(claim)}</div>`).join("")}</div>`;
  $("#answer-problem").innerHTML = `<b>Sorun.</b> Doğru pasaj gelince iş bitmiyor. Hasta önce "${esc(question.history[0].replace(/[.]$/, ""))}" diyor, sonra "${esc(question.text)}" diye soruyor. Arama doğru pasajı birinci getiriyor; pasajda yazan: <q>${esc(question.targets[0].quote)}</q>. Aynı pasajlar, aynı model, iki ayrı talimatla iki cevap:
    <div class="answer-pair">${card("rahat talimat", plain)}${card("sıkı talimat", strict)}</div>
    Belgede sadece "ilk gün kaçının" yazıyor. Rahat talimatlı model bundan, belgede olmayan bir tıbbi izin çıkardı.`;
}

const PROMPT_QUESTIONS = ["h02", "h12", "f08", "h07", "p01", "x02", "n02"];
const promptToy = { question: "h02", variant: "arama/strict" };

function promptPassage(id, number, question, cited) {
  const passage = passages.get(id);
  return `<div class="prompt-passage ${cited ? "cited" : ""}"><span class="num">[${number}]</span> <b>(${esc(passage.title)})</b>${holds(question, id) ? ' <span class="tick">✓</span>' : ""}<div>${esc(passage.body.trim())}</div></div>`;
}

function renderPromptToy() {
  const question = anyQuestion.get(promptToy.question);
  const variant = variantOf[promptToy.variant];
  const row = ANSWERS.results[variant.id][question.id];
  const ids = given(row);
  const cited = new Set(row.sources);
  const reply = JSON.stringify({ answer: row.answer, sources: row.sources, known: row.known }, null, 2);
  const earlier = question.history.map((message) => `<div class="prompt-line">Customer's earlier message: ${esc(message)}</div>`).join("");
  $("#prompt-toy").innerHTML = `
    <div class="toy-controls">
      <div class="pills">${PROMPT_QUESTIONS.map((id) => `<button data-q="${id}" class="${id === question.id ? "on" : ""}">${esc(anyQuestion.get(id).text)}</button>`).join("")}</div>
      <div class="pills">${ANSWERS.variants.map((item) => `<button data-v="${item.id}" class="${item.id === variant.id ? "on" : ""}">${esc(item.label)}</button>`).join("")}</div>
    </div>
    <div class="prompt-split">
      <div><div class="label">Luna'ya giden</div>
        <div class="prompt-box">
          <div class="prompt-head">instructions</div><div class="prompt-line instructions">${esc(ANSWERS.instructions[variant.mode])}</div>
          <div class="prompt-head">input · ${ids.length} pasaj</div>
          <div class="prompt-passages ${ids.length > 5 ? "long" : ""}">${ids.map((id, index) => promptPassage(id, index + 1, question, cited.has(index + 1))).join("")}</div>
          ${earlier}<div class="prompt-line"><b>Customer's message: ${esc(question.text)}</b></div>
        </div></div>
      <div><div class="label">Luna'dan gelen</div>
        <pre class="reply">${esc(reply)}</pre>
        <div class="chips">${chips(row)}</div>
        <p class="overall">${esc(citedNote(question, row))} · ${(row.ms / 1000).toFixed(1)} sn · $${row.cost.toFixed(5)}</p>
        ${question.ideal ? `<div class="toy-verdict"><b>İyi bir cevap ne yapar?</b> ${esc(question.ideal)} <small class="faint">(laboratuvardaki not, İngilizce)</small></div>` : ""}
      </div>
    </div>
    <p class="overall">Mavi: modelin kaynak gösterdiği pasajlar. ✓: sorunun cevabını gerçekten içeren pasaj. "Hepsi prompta" varyantında 55 pasajın hepsi gidiyor; kutuyu kaydır.</p>`;
  for (const button of document.querySelectorAll("#prompt-toy [data-q]")) button.onclick = () => { promptToy.question = button.dataset.q; renderPromptToy(); };
  for (const button of document.querySelectorAll("#prompt-toy [data-v]")) button.onclick = () => { promptToy.variant = button.dataset.v; renderPromptToy(); };
  const cites = document.querySelector("#prompt-toy .prompt-passage.cited");
  const box = document.querySelector("#prompt-toy .prompt-passages");
  if (cites && box.classList.contains("long")) box.scrollTop = cites.offsetTop - box.offsetTop - 8;
}

const JUDGE_PICKS = [
  { case: "j02", note: "Bir fiyat uydurulmuş" },
  { variant: "arama/plain", question: "f08", note: "Gerçek bir cevap: belgede olmayan bir izin" },
  { case: "j03", note: "Hiçbir şey söylemeyen cevap" },
  { case: "j14", note: "Doğru rakam, uydurma gerekçe" },
  { case: "k01", note: "Sorulmayan ayrıntıyı atlamak" },
  { case: "j05", note: "Hakemin yanıldığı yer: hesap" },
];
const judgeToy = { pick: 0 };

function judgedItem(pick) {
  if (pick.case) return ANSWERS.cases.find((item) => item.id === pick.case);
  const row = ANSWERS.results[pick.variant][pick.question];
  return { question: anyQuestion.get(pick.question).text, answer: row.answer, reference: ANSWERS.references[pick.question], correct: row.correct, claims: row.claims, expected: null, passages: given(row).map((id) => passages.get(id).body) };
}

function bar(score) {
  return `<span class="judge-bar"><i style="width:${Math.round(score * 100)}%" class="${score >= THRESHOLD ? "yes" : "no"}"></i><b style="left:${THRESHOLD * 100}%"></b></span><span class="num">${score.toFixed(2)}</span>`;
}

function renderJudgeToy() {
  const pick = JUDGE_PICKS[judgeToy.pick];
  const item = judgedItem(pick);
  const correct = item.correct >= THRESHOLD;
  const faithful = item.claims.every(([, score]) => score >= THRESHOLD);
  const against = (verdict, expected) => (expected == null ? "" : verdict === expected ? '<span class="chip ok">beklenen not</span>' : '<span class="chip no">hakem yanıldı</span>');
  $("#judge-toy").innerHTML = `
    <div class="pills">${JUDGE_PICKS.map((choice, index) => `<button data-pick="${index}" class="${index === judgeToy.pick ? "on" : ""}">${esc(choice.note)}</button>`).join("")}</div>
    <div class="chat"><div class="bubble"><small>soru</small>${esc(item.question)}</div><div class="bubble now"><small>cevap</small>${esc(item.answer)}</div></div>
    <div class="judge-split">
      <div class="judge-panel"><div class="label">1 · Doğru mu?</div>
        <p class="overall">Jev soruyu, cevabı ve iyi bir cevabın notunu okuyor: <i>${esc(item.reference)}</i></p>
        <div class="claim-row">${bar(item.correct)}<span>${correct ? "uyuşuyor" : "uyuşmuyor"}</span></div>
        <div class="chips"><span class="chip ${correct ? "ok" : "no"}">${correct ? "✓ doğru" : "✗ yanlış"}</span>${against(correct, item.expected && item.expected.correct)}</div>
      </div>
      <div class="judge-panel"><div class="label">2 · Sadık mı? Luna böldü, Jev her iddiaya baktı</div>
        ${item.claims.length ? item.claims.map(([claim, score]) => `<div class="claim-row">${bar(score)}<span class="${score >= THRESHOLD ? "" : "bad"}">${esc(claim)}</span></div>`).join("") : '<p class="overall">Cevapta hiçbir iddia yok: uydurulacak bir şey de yok, cevap sadık sayılır.</p>'}
        <div class="chips"><span class="chip ${faithful ? "ok" : "no"}">${faithful ? "✓ sadık" : "uydurma var"}</span>${against(faithful, item.expected && item.expected.faithful)}</div>
      </div>
    </div>
    <details class="given"><summary>Hakemin gördüğü pasajlar (${item.passages.length})</summary>${item.passages.map((text) => `<p>${esc(text)}</p>`).join("")}</details>
    <p class="overall">Çubuk: Jev'in "evet" olasılığı; çizgi 0.5 eşiği. ${pick.case ? "Bu cevap hakemi sınamak için elle yazıldı; notunu önceden biliyoruz." : "Bu, Luna'nın gerçek bir cevabı."}</p>`;
  for (const button of document.querySelectorAll("#judge-toy [data-pick]")) button.onclick = () => { judgeToy.pick = Number(button.dataset.pick); renderJudgeToy(); };
}

const answersToy = { question: "h01" };

function renderAnswersToy() {
  const question = anyQuestion.get(answersToy.question);
  const hard = ANSWERS.questions.map((item) => item.id);
  const option = (item) => `<option value="${item.id}" ${item.id === question.id ? "selected" : ""}>${esc(item.history.length ? `${item.history.join(" ")} → ${item.text}` : item.text)}</option>`;
  const cards = ANSWERS.variants.map((variant) => {
    const row = ANSWERS.results[variant.id][question.id];
    return `<div class="card answer-card"><div class="label">${esc(variant.label)}</div><p>${answerText(row)}</p>
      <div class="chips">${chips(row)}</div><small class="faint">${esc(citedNote(question, row))}</small></div>`;
  }).join("");
  $("#answers-toy").innerHTML = `
    <select id="answers-select" class="wide-select">
      <optgroup label="Zor sorular">${hard.map((id) => option(anyQuestion.get(id))).join("")}</optgroup>
      ${Object.entries(KINDS).map(([kind, [label]]) => `<optgroup label="${esc(label)}">${LAB.questions.filter((item) => item.kind === kind).map(option).join("")}</optgroup>`).join("")}
    </select>
    ${question.ideal ? `<div class="toy-verdict"><b>İyi bir cevap ne yapar?</b> ${esc(question.ideal)}</div>` : question.targets.length ? `<div class="toy-verdict"><b>Belgedeki cevap:</b> ${question.targets.map((target) => `<q>${esc(target.quote)}</q>`).join(" ")}</div>` : '<div class="toy-verdict"><b>Belgelerde cevabı yok.</b> İyi bir cevap bunu söyler, bir şey uydurmaz.</div>'}
    <div class="answer-grid">${cards}</div>
    <p class="overall">Sarı: hakemin pasajlarda bulamadığı iddialar. Notlar hakemin; hakem nadiren yanılıyor (laboratuvar notu).</p>`;
  const select = $("#answers-select");
  select.onchange = () => { answersToy.question = select.value; renderAnswersToy(); };
}

function renderAnswersGain() {
  const summary = ANSWERS.summaries;
  const rows = ANSWERS.variants.map((variant) => {
    const { old, hard } = summary[variant.id];
    return `<tr><td><b>${esc(variant.label)}</b></td><td class="num">${pct(old.correct)}</td><td class="num">${pct(old.faithful)}</td><td class="num">${pct(hard.correct)}</td><td class="num">${pct(hard.faithful)}</td><td class="num">$${old.answer_cost.toFixed(5)}</td></tr>`;
  }).join("");
  const plain = summary["arama/plain"], strict = summary["arama/strict"];
  $("#answers-gain").innerHTML = `<b>Kazanç.</b> İyi aramayla Luna neredeyse her soruyu doğru cevaplıyor. Asıl fark talimatta: sıkı talimat, doğruluktan bir şey kaybettirmeden uydurmayı sıfırladı (sadakat ${pct(plain.old.faithful)} → <b>${pct(strict.old.faithful)}</b>, zor sorularda ${pct(plain.hard.faithful)} → <b>${pct(strict.hard.faithful)}</b>).
    <div class="table-scroll"><table class="report"><thead><tr><th>varyant</th><th>52 soru: doğru</th><th>sadık</th><th>15 zor soru: doğru</th><th>sadık</th><th>cevap başına</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderAnswersLimit() {
  const weak = ANSWERS.summaries["zayif-arama/strict"].old;
  const row = ANSWERS.results["zayif-arama/strict"].p01;
  $("#answers-limit").innerHTML = `<b>Sınırı.</b> Pasajları Bölüm 1'in zayıf araması getirince doğruluk ${pct(weak.correct)}'a düştü. Sıkı talimatlı model yine uydurmadı (sadakat ${pct(weak.faithful)}), ama cevabı belgelerde olan soruların ${pct(weak.refused)}'sinde "bilgi yok" dedi. "Arabamı nereye bırakırım?" sorusuna cevabı: <q>${esc(row.answer)}</q> Dürüst ama boş. Sabit bir akış kötü bir sorguyu düzeltemiyor: müşteri nasıl yazdıysa öyle arıyor. Aramayı modelin kendisine bıraksak?`;
}

renderAnswerProblem();
renderPromptToy();
renderJudgeToy();
renderAnswersToy();
renderAnswersGain();
renderAnswersLimit();

const agentRow = (variant, id) => AGENT.results[variant][id];
const SEARCH_NAMES = { arama: "Bölüm 8'in araması", "zayif-arama": "Bölüm 1'in BM25'i" };

function renderAgentProblem() {
  const row = agentRow("sabit/zayif-arama", "p03");
  $("#agent-problem").innerHTML = `<b>Sorun.</b> Hasta "Dişlerimi daha beyaz yaptırmak kaça mal olur?" diye soruyor. Bölüm 1'in kelime araması için "beyaz" ile pasajdaki "beyazlatma" ayrı kelimeler, "kaça mal olur" ile "fiyat" da öyle. Pasaj gelmiyor ve sabit akış <q>${esc(row.answer)}</q> diyor. Bölüm 9'daki "arabamı nereye bırakırım" da aynı yere düşmüştü. Anlam araması (Bölüm 5) bunu çözmüştü, ama arama her zaman bu laboratuvarınki kadar iyi olmayabilir: gerçek bir işletmenin arama motoru daha kaba, belgeleri daha dağınık olabilir. Kötü bir aramayla model kendi başının çaresine bakabilir mi?`;
}

const REPLAYS = [
  { variant: "agent/zayif-arama", question: "p03", note: "Dişlerimi daha beyaz yaptırmak kaça mal olur?" },
  { variant: "agent/zayif-arama", question: "x05", note: "İki parçalı bir soru" },
  { variant: "agent/arama", question: "n02", note: "Cevabı belgelerde olmayan soru" },
  { variant: "agent/arama", question: "c01", note: "Merhaba" },
];
const replay = { pick: 0, step: 0 };

function replaySteps(pick) {
  const question = anyQuestion.get(pick.question);
  const row = agentRow(pick.variant, pick.question);
  const context = variantOfAgent(pick.variant).context;
  const seen = [];
  const message = [...question.history.map((text) => `Customer's earlier message: ${text}`), `Customer's message: ${question.text}`].join("\n");
  const steps = [{ kind: "request", who: "1. istek · biz → Luna", html: `<pre>instructions: ${esc(short(AGENT.instructions, 150))}\ntools: search_knowledge(query)\ninput: ${esc(message)}</pre>` }];
  row.steps.forEach(([query, found], index) => {
    steps.push({ kind: "call", who: `Luna → biz · cevap değil, arama isteği`, html: `<pre>function_call: search_knowledge({"query": "${esc(query)}"})</pre>` });
    const lines = found.map((id) => {
      if (!seen.includes(id)) seen.push(id);
      return `<li><span class="num">[${seen.indexOf(id) + 1}]</span> ${esc(passages.get(id).title)}${holds(question, id) ? ' <span class="tick">✓</span>' : ""}</li>`;
    }).join("");
    steps.push({ kind: "search", who: `Arama · bizim kodumuz, ${SEARCH_NAMES[context]}`, html: `<ol class="try-top plain">${lines}</ol>` });
    steps.push({ kind: "request", who: `${index + 2}. istek · biz → Luna`, html: `<pre>input: önceki her şey baştan (mesaj, Luna'nın şifreli düşüncesi, arama isteği) + aramanın sonucu; şimdiye kadar görülen pasajlar [1]-[${seen.length}]</pre>` });
  });
  steps.push({ kind: "final", who: "Luna → biz · son cevap", html: `<pre>${esc(JSON.stringify({ answer: row.answer, sources: row.sources, known: row.known }, null, 2))}</pre><div class="chips">${chips(row)}</div>` });
  return steps;
}

function variantOfAgent(id) {
  return AGENT.variants.find((variant) => variant.id === id);
}

function renderReplay() {
  const pick = REPLAYS[replay.pick];
  const steps = replaySteps(pick);
  const row = agentRow(pick.variant, pick.question);
  replay.step = Math.min(replay.step, steps.length - 1);
  $("#agent-replay").innerHTML = `
    <div class="pills">${REPLAYS.map((item, index) => `<button data-pick="${index}" class="${index === replay.pick ? "on" : ""}">${esc(item.note)} <small>(${esc(variantOfAgent(item.variant).label)})</small></button>`).join("")}</div>
    <div class="replay-bar"><button class="btn small" data-move="-1" ${replay.step ? "" : "disabled"}>← geri</button><button class="btn small primary" data-move="1" ${replay.step < steps.length - 1 ? "" : "disabled"}>ileri →</button><button class="btn small" data-move="all">hepsi</button>
      <span class="stat-line">adım ${replay.step + 1} / ${steps.length} · ${row.turns} Luna çağrısı, ${row.searches.length} arama · ${(row.ms / 1000).toFixed(1)} sn · $${row.cost.toFixed(5)}</span></div>
    <div class="replay-steps">${steps.map((step, index) => `<div class="replay-step ${step.kind} ${index > replay.step ? "later" : ""}"><span class="who">${esc(step.who)}</span>${step.html}</div>`).join("")}</div>
    <p class="overall">✓: sorunun cevabını gerçekten içeren pasaj. Numaralar konuşma boyunca sabit: ikinci aramanın getirdiği yeni pasajlar kaldığı yerden numaralanır, daha önce görülen pasaj eski numarasını korur.</p>`;
  for (const button of document.querySelectorAll("#agent-replay [data-pick]")) button.onclick = () => { replay.pick = Number(button.dataset.pick); replay.step = 0; renderReplay(); };
  for (const button of document.querySelectorAll("#agent-replay [data-move]")) {
    button.onclick = () => { replay.step = button.dataset.move === "all" ? steps.length - 1 : replay.step + Number(button.dataset.move); renderReplay(); };
  }
}

const rescued = () => LAB.questions.filter((question) => !isCorrect(agentRow("sabit/zayif-arama", question.id)) && isCorrect(agentRow("agent/zayif-arama", question.id)));
const compare = { question: "p03" };

function queryColumn(label, query, question) {
  const target = new Set(question.targets.flatMap((item) => item.passages).flatMap((id) => indexes.naive.tokenize(passages.get(id).text)));
  const words = indexes.naive.tokenize(query).map((word) => {
    const df = indexes.naive.documentFrequency(word);
    return `<span class="token ${df ? "" : "missing"} ${target.has(word) ? "in-target" : ""}">${esc(word)}${df ? `<sup>${df}</sup>` : ""}</span>`;
  }).join("");
  const found = indexes.naive.search(query, 20);
  const rank = found.findIndex((hit) => holds(question, hit.passage.id)) + 1;
  return `<div class="card"><div class="label">${esc(label)}</div><div class="query-text">${esc(query)}</div><div class="tokens">${words}</div>
    <span class="where ${rank && rank <= 5 ? "top" : "lost"}">doğru pasaj: ${rank ? `${rank}. sırada` : "ilk 20'de yok"}</span>
    <ol class="try-top">${found.slice(0, 3).map((hit, index) => `<li class="${holds(question, hit.passage.id) ? "found-row" : ""}"><span class="num">${index + 1}</span>${holds(question, hit.passage.id) ? '<span class="tick">✓</span>' : ""}${esc(short(lastTitle(hit.passage.id), 30))}</li>`).join("")}</ol></div>`;
}

function renderQueryCompare() {
  const choices = rescued();
  const question = anyQuestion.get(compare.question);
  const rewritten = agentRow("sabit/zayif-yeniden", question.id).searches[0];
  const own = agentRow("agent/zayif-arama", question.id).searches;
  $("#query-compare").innerHTML = `
    <div class="pills">${choices.map((item) => `<button data-q="${item.id}" class="${item.id === question.id ? "on" : ""}">${esc(item.history.length ? `${item.history.join(" ")} → ${item.text}` : item.text)}</button>`).join("")}</div>
    <div class="query-columns">${queryColumn("Müşterinin yazdığı", question.text, question)}${queryColumn("Luna'nın yeniden yazdığı (Bölüm 8)", rewritten, question)}${queryColumn(own.length > 1 ? "Agent'ın ilk sorgusu" : "Agent'ın sorgusu", own[0], question)}</div>
    ${own.length > 1 ? `<p class="overall">Agent bir kez daha aradı: <q>${esc(own[1])}</q></p>` : ""}
    <p class="overall">Yeşil çerçeveli kelimeler doğru pasajda da geçiyor. Bunlar, Bölüm 1'in aramasıyla sabit akışın yanlış, agent'ın doğru cevapladığı ${choices.length} soru.</p>`;
  for (const button of document.querySelectorAll("#query-compare [data-q]")) button.onclick = () => { compare.question = button.dataset.q; renderQueryCompare(); };
}

const agentToy = { question: "p05" };

function renderAgentToy() {
  const question = anyQuestion.get(agentToy.question);
  const option = (item) => `<option value="${item.id}" ${item.id === question.id ? "selected" : ""}>${esc(item.history.length ? `${item.history.join(" ")} → ${item.text}` : item.text)}</option>`;
  const cards = AGENT.variants.map((variant) => {
    const row = agentRow(variant.id, question.id);
    const searched = row.searches.length ? row.searches.map((query) => `<q>${esc(query)}</q>`).join(" · ") : "<i>aramadı</i>";
    return `<div class="card answer-card"><div class="label">${esc(variant.label)}</div><p>${answerText(row)}</p>
      <div class="chips">${chips(row)}</div><small class="faint">${variant.flow === "agent" ? `${row.searches.length} arama: ` : "aranan: "}${searched}</small></div>`;
  }).join("");
  $("#agent-toy").innerHTML = `
    <select id="agent-select" class="wide-select">
      <optgroup label="Sohbet mesajları (aramaya gerek yok)">${AGENT.questions.map(option).join("")}</optgroup>
      <optgroup label="Zor sorular">${ANSWERS.questions.map(option).join("")}</optgroup>
      ${Object.entries(KINDS).map(([kind, [label]]) => `<optgroup label="${esc(label)}">${LAB.questions.filter((item) => item.kind === kind).map(option).join("")}</optgroup>`).join("")}
    </select>
    <div class="answer-grid">${cards}</div>
    <p class="overall">Sabit akış her mesajda bir kez arar; "aranan" onun sorgusu (sohbetin devamında Bölüm 8'deki gibi önceki mesaj önüne eklenmiş). Agent kendi sorgusunu yazar ya da hiç aramaz.</p>`;
  const select = $("#agent-select");
  select.onchange = () => { agentToy.question = select.value; renderAgentToy(); };
}

function renderAgentGain() {
  const summary = AGENT.summaries;
  const rows = AGENT.variants.map((variant) => {
    const { old, hard, chat } = summary[variant.id];
    return `<tr><td><b>${esc(variant.label)}</b></td><td class="num">${pct(old.correct)}</td><td class="num">${pct(hard.correct)}</td><td class="num">${pct(chat.correct)}</td><td class="num">${old.searches.toFixed(2)}</td><td class="num">$${old.answer_cost.toFixed(5)}</td><td class="num">${(old.answer_ms / 1000).toFixed(1)} sn</td></tr>`;
  }).join("");
  const at = (key) => pct(summary[key].old.correct);
  $("#agent-gain").innerHTML = `<b>Kazanç.</b> Arama iyiyse agent kalite katmıyor (${at("sabit/arama")} ve ${at("agent/arama")}), sadece süre ve maliyet ekliyor. Arama zayıfsa büyük fark: sabit akış ${at("sabit/zayif-arama")}, Luna'nın yeniden yazdığı sorguyla ${at("sabit/zayif-yeniden")}, agent <b>${at("agent/zayif-arama")}</b>.
    <div class="table-scroll"><table class="report"><thead><tr><th>varyant</th><th>52 soru: doğru</th><th>15 zor soru</th><th>5 sohbet mesajı</th><th>ort. arama</th><th>cevap başına</th><th>ortanca süre</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="overall">Cevap başına maliyete aramalar dahil değil: Bölüm 8'in aramasında her arama ayrıca bir Jev çağrısı (~$0.00013). Sohbet mesajlarındaki yanlışların biri asistanın kendini tanıtamaması.</p>`;
}

function renderAgentLimit() {
  $("#agent-limit").innerHTML = `<b>Sınırı.</b> Agent'ın kazancının çoğu tek bir iyi yazılmış sorgudan geliyorsa, döngüye gerek var mı? Aramadan önce sorguyu bir kez "arama için genişlet" diye yeniden yazdırmak aynı kazancı daha ucuza verebilir. Bölüm 8'deki yeniden yazma bunu yapmıyordu, çünkü talimatı "gerekmedikçe değiştirme"ydi. Laboratuvar bunu henüz ölçmedi: sıradaki ders sorgunun biçimi (genişletme, birden çok sorgu, HyDE).`;
}

function renderAnswerReport() {
  const rows = [
    [ANSWERS.summaries["arama/plain"], "Rahat talimat", "9"],
    [ANSWERS.summaries["arama/strict"], "Sıkı talimat (önerilen)", "9", true],
    [ANSWERS.summaries["hepsi/strict"], "Hepsi prompta, sıkı", "9"],
    [AGENT.summaries["agent/arama"], "Agent", "10"],
    [ANSWERS.summaries["zayif-arama/strict"], "Zayıf arama, sıkı", "9"],
    [AGENT.summaries["agent/zayif-arama"], "Zayıf arama, agent", "10"],
  ];
  $("#answer-report").innerHTML = `<div class="table-scroll"><table class="report"><thead><tr><th>cevap</th><th>bölüm</th><th>52 soru: doğru</th><th>sadık</th><th>15 zor soru: doğru</th><th>sadık</th><th>ortanca süre</th><th>cevap başına</th></tr></thead>
    <tbody>${rows.map(([{ old, hard }, label, chapter, best]) => `<tr><td>${best ? `<b>${esc(label)}</b>` : esc(label)}</td><td class="num"><a href="#b${chapter}">${chapter}</a></td><td class="num">${pct(old.correct)}</td><td class="num">${pct(old.faithful)}</td><td class="num">${pct(hard.correct)}</td><td class="num">${pct(hard.faithful)}</td><td class="num">${(old.answer_ms / 1000).toFixed(1)} sn</td><td class="num">$${old.answer_cost.toFixed(5)}</td></tr>`).join("")}</tbody></table></div>
    <p class="overall">İlk dört satır iyi aramayla (Bölüm 8'in son hali), son ikisi Bölüm 1'in aramasıyla. Hepsi Luna; notlar Bölüm 9'un hakemlerinin. Cevap başına maliyete aramanın kendisi (Jev, ~$0.0004) dahil değil.</p>`;
}

renderAnswerReport();
renderAgentProblem();
renderReplay();
renderQueryCompare();
renderAgentToy();
renderAgentGain();
renderAgentLimit();
