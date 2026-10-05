"use strict";
const JOURNEY = [
  { key: "bm25-naive/last", lesson: "Ders 1", name: "BM25", text: "Kelimeleri sayan klasik arama ({{bm25}}), sıfırdan yazıldı. Hızlı ve açıklanabilir, ama Türkçeyi bilmiyor: 'İmplant' ikiye bölünüyor, 'otoparkınız' 'otopark'ı bulamıyor." },
  { key: "bm25-f5/last", lesson: "Ders 4a", name: "Türkçe kelimeler", text: "Türkçe büyük harfler (İ → i), sayılar tek parça ('1.500'), her kelimenin {{f5}}i: 'otoparkınız' ile 'otopark' 'otopa'da buluşuyor. Ekler sorununu en ucuz yoldan çözüyor." },
  { key: "e5/last", lesson: "Ders 5", name: "Embedding", text: "Kelime yerine anlam: her pasaj ve soru 384 sayılık bir vektör ({{embedding}}), en yakınlar önce. 'Arabamı nereye bırakırım' artık otopark pasajını buluyor. Ama sayılarda ve nadir terimlerde zayıf." },
  { key: "rrf/last", lesson: "Ders 6", name: "Hibrit", text: "İki aramanın listesini sıralarına göre birleştirmek ({{rrf}}: her pasaj 1/(60 + sıra) puan alır). Biri kaçırınca öbürü yakalıyor; ayar gerektirmiyor. Doğru pasaj artık %97 ilk 20'de: sorun sıralamak." },
  { key: "jev/last", lesson: "Ders 7", name: "Rerank", text: "{{hybrid|Hibrit aramanın}} ilk 20'sini {{jev}} tek tek okuyup 'bu pasaj soruyu cevaplıyor mu?' diye puanlıyor. En büyük sıçrama. Jev'in olasılığı ilk kez 'bilmiyorum' diyebilen bir sinyal." },
  { key: "jev/history", lesson: "Ders 8a", name: "Geçmiş", text: "'Ne kadar sürüyor?' tek başına anlamsız. Önceki mesajı sorgunun önüne eklemek yetiyor; bir LLM'e ({{luna}}) yeniden yazdırmaktan bile iyi. Klinik soru seti burada tavana ulaştı." },
];

const journey = { questions: "lessons", at: 0, playing: null };

function journeyValue(point, index, metric) {
  // On the lessons' own questions the last point is still lesson 8a's 52: the 10 it added are the reason it exists.
  const set = journey.questions === "all" || index === JOURNEY.length - 1 ? "all" : "lessonsOneToSeven";
  return LAB.metrics[point.key][set].summary[metric];
}

function renderJourney() {
  const width = 820, height = 340, left = 64, right = 30, top = 46, bottom = 74;
  const low = 0.2, high = 1.0;
  const x = (index) => left + (index * (width - left - right)) / (JOURNEY.length - 1);
  const y = (value) => top + ((high - value) / (high - low)) * (height - top - bottom);
  const ndcg = JOURNEY.map((point, index) => journeyValue(point, index, "nDCG@10"));
  const recall = JOURNEY.map((point, index) => journeyValue(point, index, "recall@1"));
  const path = (values) => values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const stops = JOURNEY.map((point, index) => `<stop offset="${(index / (JOURNEY.length - 1)) * 100}%" stop-color="${HEX[point.key.split("/")[0]]}"/>`).join("");
  const grid = [0.2, 0.4, 0.6, 0.8, 1.0].map((value) => `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 12}" y="${y(value) + 4}" text-anchor="end">${value.toFixed(1)}</text>`).join("");
  const points = JOURNEY.map((point, index) => {
    const color = HEX[point.key.split("/")[0]];
    return `<g class="point appear" data-index="${index}" style="transition-delay:${0.25 * index + 0.3}s">
      <circle class="halo" cx="${x(index)}" cy="${y(ndcg[index])}" r="22" fill="${color}"/>
      <circle class="dot" cx="${x(index)}" cy="${y(ndcg[index])}" r="8" fill="${color}"/>
      <text class="value" x="${x(index)}" y="${y(ndcg[index]) - 18}">${fixed(ndcg[index])}</text>
      <text class="lesson" x="${x(index)}" y="${height - bottom + 30}">${esc(point.lesson.toUpperCase())}</text>
      <text class="name" x="${x(index)}" y="${height - bottom + 48}">${esc(point.name)}</text>
      <rect x="${x(index) - 50}" y="${top - 30}" width="100" height="${height - top}" fill="transparent"/>
    </g>`;
  }).join("");
  $("#chart").innerHTML = `
    <div class="legend"><span><i></i>${term("ndcg")}</span><span><i class="dashed"></i>${term("recall1")}</span>
      <div class="switch" id="journey-switch"><button data-q="lessons">Dersin günündeki sorular</button><button data-q="all">52 sorunun hepsi</button></div></div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Derslere göre nDCG@10">
      <defs><linearGradient id="journey-gradient" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient></defs>
      <g class="grid">${grid}</g>
      <path class="recall draw" d="${path(recall)}"/>
      <path class="line draw" d="${path(ndcg)}"/>
      ${points}
    </svg>`;
  for (const button of document.querySelectorAll("#journey-switch button")) {
    button.classList.toggle("on", button.dataset.q === journey.questions);
    button.onclick = () => { journey.questions = button.dataset.q; renderJourney(); showPoint(journey.at); revealChart(true); };
  }
  for (const element of document.querySelectorAll("#chart .point")) {
    element.onclick = () => { stopPlaying(); showPoint(Number(element.dataset.index)); };
  }
  $("#journey-note").textContent = journey.questions === "all"
    ? "Bütün noktalar 52 soruda; Ders 8a'nın eklediği 10 sohbet sorusu dahil. Geçmiş eklenmeden önce bu sorular aramayı aşağı çekiyor, o yüzden son adımın kazancı burada daha büyük."
    : "İlk beş nokta Ders 1-7'nin 42 sorusunda, son nokta Ders 8a'nın 52 sorusunda. Ders 2 (cetvel), 3 (parçalama) ve 4b (motorlar) çizgide yok: biri ölçmeyi kurdu, ikisi kazanan tarifi değiştirmedi.";
}

function revealChart(now) {
  const chart = $("#chart");
  for (const line of chart.querySelectorAll(".draw")) {
    const length = line.getTotalLength();
    line.style.strokeDasharray = line.classList.contains("recall") ? "5 6" : `${length}`;
    if (line.classList.contains("recall")) continue;
    line.style.strokeDashoffset = now ? "0" : `${length}`;
  }
  if (now) chart.classList.add("shown");
}

function showPoint(index) {
  journey.at = index;
  const point = JOURNEY[index];
  const stage = point.key.split("/")[0];
  const value = journeyValue(point, index, "nDCG@10");
  const before = index ? journeyValue(JOURNEY[index - 1], index - 1, "nDCG@10") : null;
  const recall = journeyValue(point, index, "recall@1");
  for (const element of document.querySelectorAll("#chart .point")) element.classList.toggle("on", Number(element.dataset.index) === index);
  const color = COLOR[point.key.endsWith("history") ? "history" : stage];
  $("#caption").innerHTML = `
    <span class="badge" style="--stage:${color}">${esc(point.lesson)}</span>
    <h3>${esc(point.name)}</h3>
    <p>${rich(point.text)}</p>
    <div class="numbers">
      <div><span>${term("ndcg")}</span><b class="num">${fixed(value)}</b>${before == null ? "" : `<div class="delta num">${value >= before ? "+" : ""}${(value - before).toFixed(3)}</div>`}</div>
      <div><span>${term("recall1")}</span><b class="num">${fixed(recall)}</b></div>
    </div>
    <div class="controls">
      <button class="btn" id="prev" ${index ? "" : "disabled"}>◀</button>
      <button class="btn" id="next" ${index < JOURNEY.length - 1 ? "" : "disabled"}>▶</button>
      <button class="btn" id="play">${journey.playing ? "Durdur" : "Oynat"}</button>
      <button class="btn primary" id="try">Oyun alanında dene →</button>
    </div>`;
  $("#prev").onclick = () => { stopPlaying(); showPoint(index - 1); };
  $("#next").onclick = () => { stopPlaying(); showPoint(index + 1); };
  $("#play").onclick = () => (journey.playing ? stopPlaying() : play());
  $("#try").onclick = () => {
    const [stageId, mode] = point.key.split("/");
    // Questions where this step is the one that finds the passage.
    const example = { "bm25-naive": "m06", "bm25-f5": "m06", e5: "p04", rrf: "p03", jev: "e08" }[stageId];
    choose({ question: mode === "history" ? "f02" : example, stage: stageId, mode });
    document.getElementById("oyun").scrollIntoView();
  };
}

function play() {
  if (journey.at === JOURNEY.length - 1) showPoint(0);
  journey.playing = setInterval(() => {
    if (journey.at === JOURNEY.length - 1) return stopPlaying();
    showPoint(journey.at + 1);
  }, 2600);
  showPoint(journey.at);
}

function stopPlaying() {
  clearInterval(journey.playing);
  journey.playing = null;
  const button = $("#play");
  if (button) button.textContent = "Oynat";
}

const state = { question: "m06", stage: "bm25-naive", mode: "last", kind: "morphology", shown: 5 };

function modeFor(question) {
  return question.history.length ? state.mode : "last";
}

function rowsOf(stage, mode, question) {
  return LAB.results[`${stage}/${mode}`][question.id] || LAB.results[`${stage}/last`][question.id];
}


function choose(change) {
  Object.assign(state, change, { shown: 5 });
  if (change.question) state.kind = questions.get(change.question).kind;
  history.replaceState(null, "", `#q=${state.question}&s=${state.stage}&m=${state.mode}`);
  renderPlayground();
}

function renderKinds() {
  const counts = {};
  for (const question of LAB.questions) counts[question.kind] = (counts[question.kind] || 0) + 1;
  $("#kinds").innerHTML = Object.entries(KINDS).map(([kind, [label]]) => `<button data-kind="${kind}" class="${kind === state.kind ? "on" : ""}">${esc(label)} <span class="num">${counts[kind]}</span></button>`).join("");
  for (const button of document.querySelectorAll("#kinds button")) {
    button.onclick = () => { state.kind = button.dataset.kind; renderKinds(); renderList(); };
  }
  $("#kind-note").innerHTML = rich(KINDS[state.kind][1]);
}

function renderList() {
  $("#qlist").innerHTML = LAB.questions
    .filter((question) => question.kind === state.kind)
    .map((question) => `<button data-id="${question.id}" class="${question.id === state.question ? "on" : ""}"><span class="qid">${question.id}</span><span>${esc(question.history.length ? `${question.history.join(" ")} → ${question.text}` : question.text)}</span></button>`)
    .join("");
  for (const button of document.querySelectorAll("#qlist button")) button.onclick = () => choose({ question: button.dataset.id });
}

function renderChat(question) {
  const bubbles = question.history.map((message) => `<div class="bubble"><small>önceki mesaj</small>${esc(message)}</div>`);
  bubbles.push(`<div class="bubble now"><small>soru</small>${esc(question.text)}</div>`);
  if (question.kind === "none") bubbles.push(`<div class="none-note">Bu sorunun cevabı belgelerde yok.</div>`);
  $("#chat").innerHTML = bubbles.join("");
}

function renderStepper() {
  const at = stageOf[state.stage].index;
  $("#stepper").innerHTML = `<div class="fill" style="width:${(at / (stages.length - 1)) * 80}%"></div>` + stages.map((stage, index) => `
    <button class="step ${index < at ? "passed" : ""} ${index === at ? "on" : ""}" data-stage="${stage.id}" style="--stage:${COLOR[stage.id]}">
      <div class="ball">${esc(stage.lesson)}</div><b>${esc(stage.label)}</b><span>${esc(stage.detail)}</span>
    </button>`).join("");
  for (const button of document.querySelectorAll("#stepper .step")) button.onclick = () => choose({ stage: button.dataset.stage });
}

function renderModes(question) {
  const mode = modeFor(question);
  const buttons = LAB.modes.map((option) => `<button data-mode="${option.id}" class="${option.id === mode ? "on" : ""}" ${question.history.length || option.id === "last" ? "" : "disabled"}>${esc(option.label)}</button>`).join("");
  const why = question.history.length
    ? { last: "Sadece son mesaj aranıyor; Ders 1-7 böyle ölçüldü.", history: "Önceki mesaj sorgunun önüne ekleniyor (Ders 8a'nın kararı).", rewrite: "{{luna}} sohbeti tek başına anlaşılır bir sorguya çeviriyor (Ders 8a)." }[mode]
    : "Bu sorunun geçmişi yok; üç seçenek de aynı metni arar.";
  $("#moderow").innerHTML = `<span class="label">Sorgu:</span><div class="switch">${buttons}</div><span class="why">${rich(why)}</span>`;
  for (const button of document.querySelectorAll("#moderow button")) button.onclick = () => choose({ mode: button.dataset.mode });
}

function renderFlow(question) {
  const mode = modeFor(question);
  const source = { last: ["Son mesaj", "olduğu gibi"], history: ["Geçmiş + mesaj", "önüne eklenir"], rewrite: ["Luna'nın sorgusu", "yeniden yazılmış"] }[mode];
  const columns = [[{ name: source[0], small: source[1], color: mode === "last" ? "#1b2130" : HEX.history }]];
  const color = HEX[state.stage];
  if (state.stage === "rrf" || state.stage === "jev") {
    columns.push([{ name: "BM25-F5", small: "kelimeler", color: HEX["bm25-f5"] }, { name: "e5", small: "anlam", color: HEX.e5 }]);
    columns.push([{ name: "RRF", small: "1/(60 + sıra)", color: HEX.rrf }]);
    if (state.stage === "jev") columns.push([{ name: "Jev", small: "ilk 20'yi okur", color: HEX.jev }]);
  } else {
    const stage = stageOf[state.stage];
    columns.push([{ name: state.stage === "e5" ? "e5" : "BM25", small: stage.detail, color }]);
  }
  columns.push([{ name: "İlk 5", small: "aşağıda", color: "#1b2130" }]);
  const width = 760, height = 132, boxWidth = 128, boxHeight = 46;
  const x = (column) => 8 + (column * (width - 16 - boxWidth)) / (columns.length - 1);
  const y = (row, count) => height / 2 - ((count - 1) * 62) / 2 + row * 62 - boxHeight / 2;
  let edges = "", nodes = "", packets = "";
  columns.forEach((column, columnIndex) => {
    column.forEach((node, row) => {
      const left = x(columnIndex), topY = y(row, column.length);
      nodes += `<g class="node"><rect x="${left}" y="${topY}" width="${boxWidth}" height="${boxHeight}" rx="11" fill="${node.color}14" stroke="${node.color}"/>
        <text x="${left + boxWidth / 2}" y="${topY + 20}" fill="${node.color}">${esc(node.name)}</text>
        <text class="small" x="${left + boxWidth / 2}" y="${topY + 36}">${esc(node.small)}</text></g>`;
      if (columnIndex === columns.length - 1) return;
      const next = columns[columnIndex + 1];
      next.forEach((_, nextRow) => {
        const startX = left + boxWidth, startY = topY + boxHeight / 2;
        const endX = x(columnIndex + 1), endY = y(nextRow, next.length) + boxHeight / 2;
        const middle = (startX + endX) / 2;
        const d = `M${startX},${startY} C${middle},${startY} ${middle},${endY} ${endX},${endY}`;
        edges += `<path class="edge" d="${d}"/>`;
        packets += `<circle class="packet" r="4" style="--stage:${color}"><animateMotion dur="1.6s" begin="${(columnIndex * 0.4).toFixed(1)}s" repeatCount="indefinite" path="${d}"/></circle>`;
      });
    });
  });
  $("#flow").innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${edges}${packets}${nodes}</svg>`;
}

function renderQuery(question) {
  const mode = modeFor(question);
  const text = queryOf(question, mode);
  const index = { "bm25-naive": indexes.naive, "bm25-f5": indexes.f5 }[state.stage];
  const words = index
    ? `<div class="label">${term("bm25")}'in gördüğü kelimeler (üstteki sayı: ${term("df")}; üstü çizili: indekste yok)</div><div class="tokens">${tokenChips(text, index)}</div>`
    : state.stage === "e5"
      ? `<div class="label">${term("e5")} metni kelimelere ayırmaz: bütün cümle tek bir ${term("embedding", "vektöre")} dönüşür</div>`
      : `<div class="label">BM25-F5 kelimeleri</div><div class="tokens">${tokenChips(text, indexes.f5)}</div>`;
  $("#query").innerHTML = `<div class="label">Aranan metin</div><div class="text">${esc(text)}</div>${words}`;
}

function verdictFor(question, rows) {
  const mode = modeFor(question);
  const stage = stageOf[state.stage];
  if (question.kind === "none") {
    const top = rows[0];
    if (state.stage === "jev") {
      return `Cevabı belgelerde yok. Jev'in en yüksek olasılığı <b class="num">${fixed(top[1])}</b>: Ders 7'de 0.69'un altını "bilmiyorum" saydık, bu sinyal 42 sorunun 41'ini doğru ayırdı.`;
    }
    return `Cevabı belgelerde yok, ama arama yine de bir şey getiriyor: en üstteki pasajın ${term(SCORE_TERM[state.stage], esc(stage.score))}'ı <b class="num">${fixed(top[1])}</b>. Bu puandan "bilmiyorum" çıkmıyor; ilk kez Ders 7'de Jev'in olasılığı ayırabildi.`;
  }
  const ranks = question.targets.map((target) => rankIn(rows, target.passages));
  if (!stage.index) {
    return ranks.every((rank) => rank === 1) || (ranks.length > 1 && ranks.every((rank) => rank && rank <= 5))
      ? "Çıkış noktası, ve daha ilk aşamada doğru pasaj üstte."
      : "Çıkış noktası. Aşamaları sağa doğru tıkla, doğru pasaj nereye gidiyor izle.";
  }
  const previous = stages[stage.index - 1];
  const before = question.targets.map((target) => rankIn(rowsOf(previous.id, mode, question), target.passages));
  const score = (list) => list.reduce((sum, rank) => sum + (rank ? 1 / rank : 0), 0);
  const change = score(ranks) - score(before);
  const was = question.targets.length === 1 ? rankWords(before[0]) : before.map(rankWords).join(", ");
  const now = question.targets.length === 1 ? rankWords(ranks[0]) : ranks.map(rankWords).join(", ");
  const name = `<b>${esc(previous.label.replace(/^\+ /, ""))}</b>`;
  if (Math.abs(change) < 1e-9) return `Bir önceki aşamayla (${name}) aynı: ${now}.`;
  return change > 0
    ? `<span class="tick">↑</span> Bir önceki aşamada (${name}) doğru pasaj ${was}; şimdi ${now}.`
    : `<span style="color:var(--bad)">↓</span> Bir önceki aşamada (${name}) ${was}; şimdi ${now}. Her parça her soruda kazandırmıyor.`;
}

function renderVerdict(question, rows) {
  const mode = modeFor(question);
  const overall = LAB.metrics[`${state.stage}/${mode}`].all.summary;
  const targets = question.targets.map((target) => {
    const rank = rankIn(rows, target.passages);
    const kind = !rank ? "lost" : rank <= 5 ? "top" : "low";
    return `<div class="target"><span class="where ${kind}">${rankWords(rank)}</span><q>${esc(target.quote)}</q></div>`;
  }).join("");
  let hint = "";
  if (question.history.length && mode === "last") {
    const withHistory = question.targets.map((target) => rankIn(rowsOf(state.stage, "history", question), target.passages));
    hint = `<div class="overall">Geçmiş ekli aramada: ${withHistory.map(rankWords).join(", ")}.</div>`;
  }
  const verdict = $("#verdict");
  verdict.style.setProperty("--stage", COLOR[state.stage]);
  verdict.innerHTML = `<div class="say">${verdictFor(question, rows)}</div>${targets ? `<div class="targets">${targets}</div>` : ""}${hint}
    <div class="overall">Bu aramanın 52 sorudaki ortalaması: ${term("ndcg")} <span class="num">${fixed(overall["nDCG@10"])}</span>, ${term("recall1")} <span class="num">${fixed(overall["recall@1"])}</span>.</div>`;
}

function extraFor(question, row, mode) {
  const [id, , why] = row;
  if (why) {
    return Object.entries(why).sort((one, other) => other[1] - one[1]).map(([word, share]) => `<span class="token">${esc(word)} <span class="num">+${share.toFixed(2)}</span></span>`).join("") + `<span>kelime başına BM25 payı</span>`;
  }
  if (state.stage === "rrf") {
    const lexical = rankIn(rowsOf("bm25-f5", mode, question), [id]);
    const vector = rankIn(rowsOf("e5", mode, question), [id]);
    const share = (rank) => (rank ? `${rank}. → 1/${60 + rank}` : "ilk 20'de yok");
    return `<span>BM25-F5'te ${share(lexical)}</span><span>·</span><span>e5'te ${share(vector)}</span>`;
  }
  if (state.stage === "jev") {
    const before = rankIn(rowsOf("rrf", mode, question), [id]);
    return `<span>Jev'den önce, RRF'de ${rankWords(before)}</span>`;
  }
  return "";
}

function renderResults(question, rows) {
  const mode = modeFor(question);
  const stage = stageOf[state.stage];
  const max = Math.max(...rows.map((row) => row[1]), 1e-9);
  const targetOf = (id) => question.targets.filter((target) => target.passages.includes(id));
  const items = rows.slice(0, state.shown).map((row, index) => {
    const passage = passages.get(row[0]);
    const hits = targetOf(row[0]);
    const [head, ...rest] = passage.title.split(" > ");
    return `<li class="card hit ${hits.length ? "target" : ""}" style="--stage:${COLOR[state.stage]}">
      <div class="rank">${index + 1}</div>
      <div>
        <div class="title">${hits.length ? '<span class="tick">✓</span> ' : ""}<b>${esc(head)}</b>${rest.length ? " › " + esc(rest.join(" › ")) : ""}</div>
        <div class="body">${highlighted(passage.body, hits.map((target) => target.quote))}</div>
        <div class="extra">${extraFor(question, row, mode)}</div>
      </div>
      <div class="score"><b>${row[1].toFixed(state.stage === "e5" || state.stage === "rrf" ? 4 : 3)}</b><span>${term(SCORE_TERM[state.stage], esc(stage.score))}</span><div class="bar"><i style="width:${(row[1] / max) * 100}%"></i></div></div>
    </li>`;
  });
  if (rows.length > state.shown) items.push(`<button class="btn more" id="more">İlk ${Math.min(rows.length, state.shown === 5 ? 10 : 20)}'u göster</button>`);
  $("#results").innerHTML = items.join("");
  for (const body of document.querySelectorAll("#results .body")) body.onclick = () => body.classList.toggle("open");
  const more = $("#more");
  if (more) more.onclick = () => { state.shown = state.shown === 5 ? 10 : 20; renderResults(question, rows); };
}

function renderPlayground() {
  const question = questions.get(state.question);
  const rows = rowsOf(state.stage, modeFor(question), question);
  renderKinds();
  renderList();
  renderChat(question);
  renderStepper();
  renderModes(question);
  renderFlow(question);
  renderQuery(question);
  renderVerdict(question, rows);
  renderResults(question, rows);
}

const free = { text: "otoparkınız var mı", tokenizer: "f5" };

function renderFree() {
  const suggestions = ["otoparkınız var mı", "İmplant fiyatı", "arabamı nereye bırakırım", "kanal tedavisi kaç seans", "1.500 TL"];
  $("#free").innerHTML = `
    <input id="free-input" value="${esc(free.text)}" placeholder="Bir soru yaz..." autocomplete="off">
    <div class="suggest">${suggestions.map((text) => `<button data-text="${esc(text)}">${esc(text)}</button>`).join("")}</div>
    <div class="moderow"><span class="label">Kelimeler:</span><div class="switch" id="free-switch">
      <button data-t="naive">str.lower() (Ders 1)</button><button data-t="f5">Türkçe + ilk 5 harf (Ders 4a)</button></div></div>
    <div class="honest">Burada sadece BM25 çalışıyor, senin tarayıcında: indeksi sayfa açılınca 55 pasajdan kendisi kurdu. Embedding ve Jev tarayıcıda çalışamıyor; onlar için hazır sorulardan birini seç. Paraphrase bir soru dene ("arabamı nereye bırakırım"): kelime araması ortak kelime bulamayınca neden kör kaldığını göreceksin.</div>
    <div class="query"><div class="label">${term("bm25")}'in gördüğü kelimeler (üstteki sayı: ${term("df")})</div><div class="tokens" id="free-tokens"></div></div>
    <ol class="results" id="free-results"></ol>`;
  const input = $("#free-input");
  input.oninput = () => { free.text = input.value; renderFreeResults(); };
  for (const button of document.querySelectorAll("#free .suggest button")) button.onclick = () => { free.text = button.dataset.text; input.value = free.text; renderFreeResults(); };
  for (const button of document.querySelectorAll("#free-switch button")) button.onclick = () => { free.tokenizer = button.dataset.t; renderFreeResults(); };
  renderFreeResults();
}

function renderFreeResults() {
  const index = indexes[free.tokenizer];
  for (const button of document.querySelectorAll("#free-switch button")) button.classList.toggle("on", button.dataset.t === free.tokenizer);
  $("#free-tokens").innerHTML = tokenChips(free.text, index) || '<span class="overall">Kelime yok.</span>';
  const hits = index.search(free.text, 5);
  const color = COLOR[free.tokenizer === "f5" ? "bm25-f5" : "bm25-naive"];
  const max = Math.max(...hits.map((hit) => hit.score), 1e-9);
  $("#free-results").innerHTML = hits.length ? hits.map((hit, rank) => {
    const [head, ...rest] = hit.passage.title.split(" > ");
    const why = Object.entries(hit.why).sort((one, other) => other[1] - one[1]).map(([word, share]) => `<span class="token">${esc(word)} <span class="num">+${share.toFixed(2)}</span></span>`).join("");
    return `<li class="card hit" style="--stage:${color}"><div class="rank">${rank + 1}</div>
      <div><div class="title"><b>${esc(head)}</b>${rest.length ? " › " + esc(rest.join(" › ")) : ""}</div><div class="body">${esc(hit.passage.body)}</div><div class="extra">${why}</div></div>
      <div class="score"><b>${hit.score.toFixed(3)}</b><span>${term("bm25-score")}</span><div class="bar"><i style="width:${(hit.score / max) * 100}%"></i></div></div></li>`;
  }).join("") : `<li class="honest">Hiçbir pasajda bu kelimelerden biri yok, BM25 hiçbir şey getirmiyor. Embedding burada bir şey bulurdu.</li>`;
  for (const body of document.querySelectorAll("#free-results .body")) body.onclick = () => body.classList.toggle("open");
}

function readHash() {
  const found = Object.fromEntries(location.hash.slice(1).split("&").map((pair) => pair.split("=")).filter(([key, value]) => key && value));
  if (questions.has(found.q)) state.question = found.q;
  if (stageOf[found.s]) state.stage = found.s;
  if (LAB.modes.some((mode) => mode.id === found.m)) state.mode = found.m;
  state.kind = questions.get(state.question).kind;
}

for (const button of document.querySelectorAll(".tabs button")) {
  button.onclick = () => {
    for (const other of document.querySelectorAll(".tabs button")) other.classList.toggle("on", other === button);
    $("#ready").hidden = button.dataset.tab !== "ready";
    $("#free").hidden = button.dataset.tab !== "free";
  };
}

renderJourney();
revealChart(false);
showPoint(0);
new IntersectionObserver((entries, observer) => {
  if (entries.some((entry) => entry.isIntersecting)) {
    requestAnimationFrame(() => revealChart(true));
    observer.disconnect();
  }
}, { threshold: 0.3 }).observe($("#chart"));
readHash();
renderPlayground();
renderFree();
