"use strict";

const pct = (value) => `%${Math.round(value * 100)}`;

function chapterOf(number) {
  return CHAPTERS.find((chapter) => chapter.number === number);
}


function renderRagLine() {
  const boxes = [["Soru", "Pazar günü açık mısınız?"], ["Bul", "Bölüm 1-8"], ["Doğru pasajlar", "Pazar günleri kapalıyız."], ["Model", "pasajlarla cevap yazar, Bölüm 9"], ["Cevap", "Hayır, pazar günleri kapalıyız."]];
  $("#rag-line").innerHTML = boxes.map(([name, small], index) => `
    <div class="rag-box ${index === 1 ? "focus" : ""}"><b>${esc(name)}</b><span>${esc(small)}</span></div>`).join('<div class="rag-arrow">→</div>');
}

function renderExamples() {
  const picks = [
    ["e04", "Kelimeler aynen geçiyor"],
    ["p01", "Aynı anlam, ortak kelime yok"],
    ["f02", "Önceki mesaj olmadan eksik"],
    ["n02", "Cevabı belgelerde yok"],
  ];
  $("#examples").innerHTML = picks.map(([id, note]) => {
    const question = questions.get(id);
    const target = question.targets[0];
    const said = question.history.map((message) => `<div class="bubble small">${esc(message)}</div>`).join("");
    const answer = target
      ? `<div class="found"><span>Cevabı içeren cümle, <b>${esc(passages.get(target.passages[0]).title.split(" > ")[0])}</b> belgesinde:</span><q>${esc(target.quote)}</q></div>`
      : `<div class="found none"><span>Belgelerde cevabı yok. İyi bir asistan burada "bilmiyorum" der, bir şey uydurmaz.</span></div>`;
    return `<div class="card example"><div class="kind">${esc(note)}</div>${said}<div class="bubble now">${esc(question.text)}</div>${answer}</div>`;
  }).join("");
}

const MAP_NODES = [
  { id: "docs", label: "Belgeler", sub: "12 belge", x: 10, y: 16, text: "Kliniğin kendi belgeleri: fiyatlar, saatler, sigorta, tedavi sonrası. Belgeler değişince indeks yeniden kurulur." },
  { id: "cut", label: "Parçala", sub: "55 pasaj", x: 160, y: 16, chapter: "1", text: "Belgeyi aranabilir parçalara bölmek. Nereden kestiğin, neyin bulunabileceğini belirler." },
  { id: "index", label: "İndeks", sub: "kelime → pasajlar", x: 310, y: 16, chapter: "2", text: "Hangi kelimenin hangi pasajda geçtiğini önceden tutan tablo; arama soru başına bütün metni okumaz." },
  { id: "question", label: "Soru", sub: "hastadan", x: 10, y: 148, text: "Hastanın mesajı. Bazen tek başına eksik: \"Ne kadar sürüyor?\"" },
  { id: "chat", label: "Sohbet", sub: "önceki mesajlar", x: 160, y: 148, chapter: "8" },
  { id: "words", label: "Kelime araması", sub: "BM25, Türkçe", x: 310, y: 104, chapter: "2", also: "4", text: "Sorunun kelimelerini pasajlarda arar ve nadirliğine, tekrarına, pasajın uzunluğuna göre puanlar (Bölüm 2). Türkçe ekler için kelimeleri kısaltmak Bölüm 4'te." },
  { id: "meaning", label: "Anlam araması", sub: "embedding", x: 310, y: 192, chapter: "5" },
  { id: "fuse", label: "Birleştir", sub: "RRF", x: 460, y: 148, chapter: "6" },
  { id: "rerank", label: "Yeniden sırala", sub: "ilk 20'yi okur", x: 610, y: 148, chapter: "7" },
  { id: "top", label: "İlk 5 pasaj", sub: "modele gider", x: 760, y: 148, text: "Aramanın çıktısı: modelin önüne konacak birkaç pasaj, numaralı." },
  { id: "answer", label: "Cevap", sub: "kaynaklı, notlu", x: 910, y: 148, chapter: "9" },
];
const MAP_EDGES = [["docs", "cut"], ["cut", "index"], ["question", "chat"], ["chat", "words"], ["chat", "meaning"], ["words", "fuse"], ["meaning", "fuse"], ["fuse", "rerank"], ["rerank", "top"], ["top", "answer"]];

function renderMap() {
  const width = 1050, height = 300, boxWidth = 130, boxHeight = 52;
  const node = Object.fromEntries(MAP_NODES.map((item) => [item.id, item]));
  const ready = (item) => !item.chapter || chapterOf(item.chapter).ready;
  const edge = (from, to) => {
    const startX = from.x + boxWidth, startY = from.y + boxHeight / 2, endX = to.x, endY = to.y + boxHeight / 2, middle = (startX + endX) / 2;
    return `<path class="edge" d="M${startX},${startY} C${middle},${startY} ${middle},${endY} ${endX},${endY}"/>`;
  };
  const edges = MAP_EDGES.map(([from, to]) => edge(node[from], node[to])).join("")
    + `<path class="edge uses" d="M${node.index.x + boxWidth / 2},${node.index.y + boxHeight} L${node.words.x + boxWidth / 2},${node.words.y}"/>`;
  const boxes = MAP_NODES.map((item) => {
    const wide = item.also ? 14 : 0;
    const badge = item.chapter ? `<g class="badge"><rect x="${item.x - 8 - wide / 2}" y="${item.y - 8}" width="${24 + wide}" height="24" rx="12"/><text x="${item.x + 4}" y="${item.y + 8}">${item.also ? `${item.chapter}·${item.also}` : item.chapter}</text></g>` : "";
    return `<g class="map-node ${ready(item) ? "ready" : "later"} ${item.chapter ? "link" : ""}" data-node="${item.id}">
      <rect x="${item.x}" y="${item.y}" width="${boxWidth}" height="${boxHeight}" rx="12"/>
      <text class="name" x="${item.x + boxWidth / 2}" y="${item.y + 23}">${esc(item.label)}</text>
      <text class="small" x="${item.x + boxWidth / 2}" y="${item.y + 40}">${esc(item.sub)}</text>${badge}</g>`;
  }).join("");
  const loop = `<g class="map-node ${chapterOf("10").ready ? "ready" : "later"} link loop" data-node="agent"><path class="edge again" d="M${node.answer.x + boxWidth / 2},${node.answer.y} C${node.answer.x + boxWidth / 2},70 600,70 ${node.words.x + boxWidth},${node.words.y + 14}"/>
    <text class="small" x="700" y="84">agent: gerekirse yeniden arar</text>
    <g class="badge"><circle cx="${node.answer.x + boxWidth / 2}" cy="100" r="12"/><text x="${node.answer.x + boxWidth / 2}" y="104">10</text></g></g>`;
  const ruler = `<g class="map-node ${chapterOf("3").ready ? "ready" : "later"} link ruler" data-node="measure"><rect x="310" y="262" width="580" height="30" rx="10"/>
    <text class="small" x="600" y="282">Ölçmek: her adımın kazancı aynı 52 soruyla ölçülür</text>
    <g class="badge"><circle cx="314" cy="266" r="12"/><text x="314" y="270">3</text></g></g>`;
  $("#map").innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Aramanın bütün adımları">${edges}${loop}${boxes}${ruler}</svg>`;
  const caption = $("#map-caption");
  const describe = (id) => {
    if (id === "measure") return { ...chapterOf("3"), chapter: chapterOf("3") };
    if (id === "agent") return { ...chapterOf("10"), chapter: chapterOf("10") };
    const item = node[id];
    const chapter = item.chapter && chapterOf(item.chapter);
    return { title: chapter ? chapter.title : item.label, teaser: item.text || chapter.teaser, number: item.chapter, ready: !chapter || chapter.ready, chapter };
  };
  const show = (id) => {
    const found = describe(id);
    caption.innerHTML = `${found.number ? `<span class="badge-inline">Bölüm ${esc(found.number)}${found.ready ? "" : " · yakında"}</span>` : ""}<b>${esc(found.title)}</b>${found.chapter ? ` <span class="tags inline">${termTags(found.chapter)}</span>` : ""} ${esc(found.teaser)}`;
  };
  caption.innerHTML = "Bir kutunun üzerine gel: ne yaptığını ve hangi bölümde anlatıldığını görürsün.";
  for (const element of document.querySelectorAll("#map .map-node")) {
    element.onmouseenter = () => show(element.dataset.node);
    element.onclick = () => {
      const id = { measure: "3", agent: "10" }[element.dataset.node] || node[element.dataset.node].chapter;
      const section = id && document.getElementById(chapterOf(id).id);
      if (section) section.scrollIntoView();
    };
  }
}


const CUT_QUESTIONS = [
  { text: "Kanal tedavisi kaç seans sürüyor?", quote: "Dişin durumuna göre genellikle iki seans gerekir." },
  { text: "Dolgu ne kadar sürer?", quote: "Tek seansta yapılır ve yaklaşık 45 dakika sürer." },
  { text: "İmplant tedavisi kaç ay sürer?", quote: "İmplant tedavisi, iyileşme süresiyle birlikte üç ile altı ay sürer." },
];
const CUTS = { baslik: "Başlıklara göre", "sabit-30": "Her 30 kelimede bir", cumle: "Her cümle ayrı" };
const PALETTE = ["#2f5bea", "#0f9f8f", "#d97706", "#8b5cf6", "#e0457b", "#16a34a"];
const chunkToy = { question: 0, cut: "sabit-30", titles: false };

const words = (text) => text.trim().split(/\s+/);

// How much of the quote a passage holds: all of it, its start at the passage's end, its end at the passage's start, or none.
function holding(body, quote) {
  const have = words(body), want = words(quote);
  if (have.join(" ").includes(want.join(" "))) return { part: "full", text: quote };
  for (let size = want.length - 1; size >= 2; size -= 1) {
    if (have.slice(-size).join(" ") === want.slice(0, size).join(" ")) return { part: "start", text: want.slice(0, size).join(" ") };
    if (have.slice(0, size).join(" ") === want.slice(-size).join(" ")) return { part: "end", text: want.slice(-size).join(" ") };
  }
  return { part: "none" };
}

function renderChunkToy() {
  const question = CUT_QUESTIONS[chunkToy.question];
  const chunks = LAB.chunkings[chunkToy.cut];
  const found = chunks.map((chunk) => holding(chunk.body, question.quote));
  const titled = chunkToy.titles && chunkToy.cut !== "sabit-30";
  const average = Math.round(chunks.reduce((sum, chunk) => sum + words(chunk.body).length, 0) / chunks.length);
  const full = found.findIndex((match) => match.part === "full");
  const pieces = found.map((match, index) => [match, index]).filter(([match]) => match.part !== "none");
  const last = (title) => title.split(" > ").pop();
  let verdict;
  if (full < 0) {
    const [start, end] = [pieces.find(([match]) => match.part === "start"), pieces.find(([match]) => match.part === "end")];
    verdict = `<b class="bad">Cevap iki parçaya bölündü.</b> #${start[1] + 1} "…${esc(words(chunks[start[1]].body).slice(-6).join(" "))}" diye bitiyor, #${end[1] + 1} "${esc(words(chunks[end[1]].body).slice(0, 6).join(" "))}…" diye başlıyor. Sabit kesim cümlenin ortasından geçiyor: arama ikisinden birini getirse bile cevabın yarısı eksik, ve ikinci parça neyin cevabı olduğunu söylemiyor.`;
  } else if (chunkToy.cut === "baslik") {
    verdict = `<b class="good">Cevap tek parçada:</b> #${full + 1}, "${esc(last(chunks[full].title))}" başlığının altı. Parça başlığın altını bütün olarak taşıdığı için model hem cevabı hem neyin cevabı olduğunu görür.`;
  } else if (chunkToy.cut === "cumle") {
    verdict = titled
      ? `<b class="good">Cevap tek bir cümlede (#${full + 1}), ve başlık yolu neyin cevabı olduğunu söylüyor:</b> "${esc(chunks[full].title)}". Kısa parça, aranan kelimeleri daha ağır bastırır; başlık yolu da bağlamı geri verir.`
      : `<b>Cevap tek bir cümlede (#${full + 1}):</b> kısa ve odaklı. Ama tek başına "${esc(question.quote)}" Neyin? Başlık yolunu aç.`;
  } else {
    verdict = `<b>Bu soruda cevap tek parçaya düştü (#${full + 1})</b>, ama parça "${esc(words(chunks[full].body).slice(0, 5).join(" "))}…" diye başlıyor: neyin olduğu önceki parçada kalmış olabilir. Sabit kesim belgenin yapısını bilmiyor.`;
  }
  const cards = chunks.map((chunk, index) => {
    const match = found[index];
    const title = titled ? `<div class="chunk-title">${esc(chunk.title)}</div>` : "";
    const body = match.part === "none" ? esc(chunk.body) : highlighted(chunk.body, [match.text]);
    return `<div class="chunk ${match.part === "none" ? "" : "holds"}" style="--c:${PALETTE[index % PALETTE.length]}" data-index="${index}"><span class="chunk-n">#${index + 1}</span>${title}<div>${body}</div></div>`;
  }).join("");
  $("#chunk-toy").innerHTML = `
    <div class="toy-controls">
      <div class="pills">${CUT_QUESTIONS.map((item, index) => `<button data-q="${index}" class="${index === chunkToy.question ? "on" : ""}">${esc(item.text)}</button>`).join("")}</div>
      <div class="row">
        <div class="switch">${Object.entries(CUTS).map(([id, label]) => `<button data-cut="${id}" class="${id === chunkToy.cut ? "on" : ""}">${esc(label)}</button>`).join("")}</div>
        <label class="check ${chunkToy.cut === "sabit-30" ? "off" : ""}"><input type="checkbox" ${chunkToy.titles ? "checked" : ""} ${chunkToy.cut === "sabit-30" ? "disabled" : ""}> Başlık yolu</label>
        <span class="stat-line">${chunks.length} parça, ortalama ${average} kelime${chunkToy.cut === "sabit-30" ? ". Sabit kesimde başlık yolu yok: parça bir başlığın ortasından başlayabiliyor" : ""}</span>
      </div>
    </div>
    <div class="toy-verdict">${verdict}</div>
    <div class="chunks" id="chunks">${cards}</div>`;
  for (const button of document.querySelectorAll("#chunk-toy [data-q]")) button.onclick = () => { chunkToy.question = Number(button.dataset.q); renderChunkToy(); };
  for (const button of document.querySelectorAll("#chunk-toy [data-cut]")) button.onclick = () => { chunkToy.cut = button.dataset.cut; renderChunkToy(); };
  const box = $("#chunk-toy input[type=checkbox]");
  box.onchange = () => { chunkToy.titles = box.checked; renderChunkToy(); };
  const first = $("#chunks .chunk.holds");
  if (first) $("#chunks").scrollTop = first.offsetTop - $("#chunks").offsetTop - 12;
}


const toyIndex = new BM25(LAB.passages, tokenizers.naive);
const bm = { query: "diş çekimi ücreti", k1: 1.2, b: 0.75, picked: null, df: null, count: 3, ratio: 0 };
const BM_SUGGESTIONS = ["diş çekimi ücreti", "kanal tedavisi kaç seans", "diş taşı temizliği", "implant için kemik tozu gerekir mi"];

function queryWords() {
  return [...new Set(toyIndex.tokenize(bm.query))];
}

function renderBm() {
  toyIndex.k1 = bm.k1;
  toyIndex.b = bm.b;
  renderIndexToy();
  renderIdfToy();
  renderTfToy();
  renderLengthToy();
  renderScoreToy();
}

function renderQueryBar() {
  const input = $("#bm-query");
  input.oninput = () => { bm.query = input.value; bm.picked = null; bm.df = null; renderBm(); };
  $("#bm-suggest").innerHTML = BM_SUGGESTIONS.map((text) => `<button data-text="${esc(text)}">${esc(text)}</button>`).join("");
  for (const button of document.querySelectorAll("#bm-suggest button")) {
    button.onclick = () => { bm.query = button.dataset.text; input.value = bm.query; bm.picked = null; bm.df = null; renderBm(); };
  }
}

function renderIndexToy() {
  const rows = queryWords().map((word) => {
    const postings = toyIndex.postings.get(word) || new Map();
    let cells = "", document = null;
    LAB.passages.forEach((passage, number) => {
      if (passage.document !== document) { if (document) cells += '<span class="gap"></span>'; document = passage.document; }
      const count = postings.get(number) || 0;
      cells += `<span class="cell c${Math.min(count, 3)}" title="${esc(passage.title)}${count ? `: ${count} kez` : ""}"></span>`;
    });
    const note = postings.size ? `<b class="num">${postings.size}</b> pasajda` : `<span class="bad">hiçbir pasajda yok</span>`;
    return `<div class="strip-row"><span class="token">${esc(word)}</span><div class="strip">${cells}</div><span class="strip-note">${note}</span></div>`;
  });
  const counted = queryWords().map((word) => [word, toyIndex.documentFrequency(word)]).filter(([, df]) => df).sort((one, other) => one[1] - other[1]);
  const summary = counted.length >= 2
    ? `"${esc(counted[0][0])}" ${counted[0][1]} pasajda, "${esc(counted[counted.length - 1][0])}" ${counted[counted.length - 1][1]} pasajda geçiyor. Sorunun bütün kelimeleri için bakılan şey bu ${counted.length} satır; geri kalan ${toyIndex.postings.size - counted.length} kelimenin satırına hiç bakılmıyor.`
    : "Bir kelime daha yaz: satırları karşılaştıralım.";
  $("#index-toy").innerHTML = `
    <div class="strip-legend"><span>Her kutu bir pasaj, belgelere göre gruplu. Dolu kutu: kelime o pasajda geçiyor; ne kadar koyuysa o kadar çok. Üzerine gel, pasajın adını gör.</span>
      <span class="keys"><span class="cell c1"></span>1 kez <span class="cell c2"></span>2 kez <span class="cell c3"></span>3+ kez</span></div>
    ${rows.join("") || '<div class="overall">Kelime yok.</div>'}
    <div class="toy-verdict">${summary}</div>`;
}

function plot({ width = 560, height = 230, xs, ys, extra = "", xLabel, yLabel, xTicks = null, xFormat = (value) => Math.round(value), yDigits = 1 }) {
  const left = 46, right = 14, top = 14, bottom = 36;
  const x = (value) => left + ((value - xs[0]) / (xs[1] - xs[0])) * (width - left - right);
  const y = (value) => top + (1 - (value - ys[0]) / (ys[1] - ys[0])) * (height - top - bottom);
  const ticks = (low, high, count) => Array.from({ length: count + 1 }, (_, index) => low + ((high - low) * index) / count);
  const grid = ticks(ys[0], ys[1], 4).map((value) => `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${value.toFixed(yDigits)}</text>`).join("")
    + (xTicks || ticks(xs[0], xs[1], 5)).map((value) => `<text x="${x(value)}" y="${height - bottom + 16}" text-anchor="middle">${xFormat(value)}</text>`).join("");
  return { x, y, svg: (body) => `<svg viewBox="0 0 ${width} ${height}" class="plot"><g class="grid">${grid}</g>
    <text class="axis" x="${width - right}" y="${height - 4}" text-anchor="end">${esc(xLabel)}</text>
    <text class="axis" x="${left}" y="10">${esc(yLabel)}</text>${body}${extra}</svg>` };
}

function renderIdfToy() {
  const n = LAB.passages.length;
  const idf = (df) => Math.log(1 + (n - df + 0.5) / (df + 0.5));
  const known = queryWords().map((word) => [word, toyIndex.documentFrequency(word)]).filter(([, df]) => df);
  if (bm.df == null) bm.df = known.length ? known[0][1] : 6;
  const chart = plot({ xs: [1, n], ys: [0, 4], xLabel: "kaç pasajda geçtiği (df)", yLabel: "ağırlık (IDF)" });
  const line = Array.from({ length: n }, (_, index) => `${index ? "L" : "M"}${chart.x(index + 1).toFixed(1)},${chart.y(idf(index + 1)).toFixed(1)}`).join(" ");
  const dots = known.map(([word, df], index) => `<circle cx="${chart.x(df)}" cy="${chart.y(idf(df))}" r="6" class="dot"/><text class="dot-label" x="${chart.x(df) + 9}" y="${chart.y(idf(df)) - 8 - (index % 2) * 14}">${esc(word)}</text>`).join("");
  const marker = `<line class="marker" x1="${chart.x(bm.df)}" x2="${chart.x(bm.df)}" y1="${chart.y(0)}" y2="${chart.y(idf(bm.df))}"/><circle cx="${chart.x(bm.df)}" cy="${chart.y(idf(bm.df))}" r="4" class="marker-dot"/>`;
  const value = idf(bm.df);
  $("#idf-toy").innerHTML = `<div class="toy-split">
    ${chart.svg(`<path class="curve" d="${line}"/>${marker}${dots}`)}
    <div class="toy-side">
      <label class="slider"><span>df = <b class="num">${bm.df}</b></span><input type="range" min="1" max="${n}" value="${bm.df}" id="idf-slider"></label>
      <div class="formula">IDF = ln(1 + (N − df + 0.5) / (df + 0.5))<br>= ln(1 + (${n} − ${bm.df} + 0.5) / (${bm.df} + 0.5))<br>= <b>${value.toFixed(2)}</b></div>
      <p>N = ${n}, bütün pasajların sayısı. ${bm.df} pasajda geçen bir kelimenin ağırlığı, tek bir pasajda geçen bir kelimeninkinin <b>${pct(value / idf(1))}</b> kadarı. Sorunun kelimeleri eğrinin üzerinde; nadir olanlar solda ve yukarıda.</p>
    </div></div>`;
  const slider = $("#idf-slider");
  slider.oninput = () => { bm.df = Number(slider.value); renderIdfToy(); };
}

function tfScore(count, ratio = 1) {
  return (count * (bm.k1 + 1)) / (count + bm.k1 * (1 - bm.b + bm.b * ratio));
}

function renderTfToy() {
  const chart = plot({ xs: [0, 10], ys: [0, 4], xLabel: "pasajda kaç kez geçtiği", yLabel: "tekrar puanı" });
  const curve = Array.from({ length: 101 }, (_, index) => `${index ? "L" : "M"}${chart.x(index / 10).toFixed(1)},${chart.y(tfScore(index / 10)).toFixed(1)}`).join(" ");
  const plain = `M${chart.x(0)},${chart.y(0)} L${chart.x(4)},${chart.y(4)}`;
  const ceiling = bm.k1 + 1;
  const value = tfScore(bm.count);
  $("#tf-toy").innerHTML = `<div class="toy-split">
    ${chart.svg(`<path class="plain" d="${plain}"/><text class="dot-label faint" x="${chart.x(3.2)}" y="${chart.y(3.6)}">düz sayma</text>
      ${ceiling <= 4 ? `<line class="ceiling" x1="${chart.x(0)}" x2="${chart.x(10)}" y1="${chart.y(ceiling)}" y2="${chart.y(ceiling)}"/><text class="dot-label faint" x="${chart.x(10) - 4}" y="${chart.y(ceiling) - 6}" text-anchor="end">tavan: k1 + 1 = ${ceiling.toFixed(1)}</text>` : ""}
      <path class="curve" d="${curve}"/><circle class="dot" cx="${chart.x(bm.count)}" cy="${chart.y(value)}" r="6"/>`)}
    <div class="toy-side">
      <label class="slider"><span>kaç kez = <b class="num">${bm.count}</b></span><input type="range" min="1" max="10" value="${bm.count}" id="tf-count"></label>
      <label class="slider"><span>k1 = <b class="num">${bm.k1.toFixed(1)}</b></span><input type="range" min="0" max="3" step="0.1" value="${bm.k1}" id="tf-k1"></label>
      <div class="formula">tekrar puanı = kez × (k1 + 1) / (kez + k1)<br>= ${bm.count} × ${ceiling.toFixed(1)} / (${bm.count} + ${bm.k1.toFixed(1)}) = <b>${value.toFixed(2)}</b></div>
      <p>1 kez: ${tfScore(1).toFixed(2)}, 2 kez: ${tfScore(2).toFixed(2)}, 5 kez: ${tfScore(5).toFixed(2)}, 10 kez: ${tfScore(10).toFixed(2)}. Puan hiçbir zaman tavanı (k1 + 1 = ${ceiling.toFixed(1)}) geçmiyor. k1 = 0 olursa sadece "var mı, yok mu"ya bakılır; k1 büyüdükçe tekrar daha çok sayılır. Varsayılan 1.2. (Burada pasaj ortalama uzunlukta; uzunluğun etkisi bir sonraki adımda.)</p>
    </div></div>`;
  const count = $("#tf-count"), k1 = $("#tf-k1");
  count.oninput = () => { bm.count = Number(count.value); renderTfToy(); };
  k1.oninput = () => { bm.k1 = Number(k1.value); renderBm(); };
}

function renderLengthToy() {
  const average = toyIndex.averageLength;
  const ratio = 2 ** bm.ratio;
  const chart = plot({ xs: [-2, 2], ys: [0, 2], xLabel: "pasajın uzunluğu, ortalamanın kaç katı", yLabel: "1 kez geçen kelimenin puanı", xTicks: [-2, -1, 0, 1, 2], xFormat: (exponent) => `${2 ** exponent}×` });
  const curve = Array.from({ length: 81 }, (_, index) => { const exponent = -2 + index / 20; return `${index ? "L" : "M"}${chart.x(exponent).toFixed(1)},${chart.y(tfScore(1, 2 ** exponent)).toFixed(1)}`; }).join(" ");
  const value = tfScore(1, ratio);
  const lengths = toyIndex.lengths.map((length, number) => [length, number]).sort((one, other) => one[0] - other[0]);
  const [short, long] = [lengths[0], lengths[lengths.length - 1]];
  $("#length-toy").innerHTML = `<div class="toy-split">
    ${chart.svg(`<line class="ceiling" x1="${chart.x(0)}" x2="${chart.x(0)}" y1="${chart.y(0)}" y2="${chart.y(2)}"/><path class="curve" d="${curve}"/><circle class="dot" cx="${chart.x(bm.ratio)}" cy="${chart.y(value)}" r="6"/>`)}
    <div class="toy-side">
      <label class="slider"><span>uzunluk = <b class="num">${ratio.toFixed(2)}×</b> ortalama</span><input type="range" min="-2" max="2" step="0.1" value="${bm.ratio}" id="len-ratio"></label>
      <label class="slider"><span>b = <b class="num">${bm.b.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.05" value="${bm.b}" id="len-b"></label>
      <div class="formula">tekrar puanı = kez × (k1 + 1) / (kez + k1 × (1 − b + b × uzunluk / ortalama))<br>= 1 × ${(bm.k1 + 1).toFixed(1)} / (1 + ${bm.k1.toFixed(1)} × (1 − ${bm.b.toFixed(2)} + ${bm.b.toFixed(2)} × ${ratio.toFixed(2)})) = <b>${value.toFixed(2)}</b></div>
      <p>Bu sayfadaki pasajlar ortalama ${average.toFixed(0)} kelime (başlık yolu dahil). En kısası ${short[0]} kelime (${esc(LAB.passages[short[1]].title)}), en uzunu ${long[0]} kelime (${esc(LAB.passages[long[1]].title)}). Uzun pasajda aynı kelime daha az puan getiriyor; b = 0 olunca uzunluk hiç fark etmiyor.</p>
    </div></div>`;
  const slider = $("#len-ratio"), b = $("#len-b");
  slider.oninput = () => { bm.ratio = Number(slider.value); renderLengthToy(); };
  b.oninput = () => { bm.b = Number(b.value); renderBm(); };
}

function markWords(text, wanted, tokenize) {
  return esc(text).replace(/[\p{L}\p{N}_]+/gu, (word) => (tokenize(word).some((token) => wanted.has(token)) ? `<mark>${word}</mark>` : word));
}

function renderScoreToy() {
  const hits = toyIndex.search(bm.query, 5);
  if (!hits.length) {
    $("#score-toy").innerHTML = `<div class="toy-verdict">Hiçbir pasajda sorunun kelimelerinden biri yok: BM25 hiçbir şey getirmiyor.</div>`;
    return;
  }
  if (!hits.some((hit) => hit.passage.id === bm.picked)) bm.picked = hits[0].passage.id;
  const max = hits[0].score;
  const number = LAB.passages.findIndex((passage) => passage.id === bm.picked);
  const passage = LAB.passages[number];
  const length = toyIndex.lengths[number];
  const wanted = queryWords();
  let total = 0;
  const rows = wanted.map((word) => {
    const count = (toyIndex.postings.get(word) || new Map()).get(number) || 0;
    const df = toyIndex.documentFrequency(word);
    const weight = df ? toyIndex.idf(word) : 0;
    const repeat = count ? toyIndex.tf(count, length) : 0;
    total += weight * repeat;
    return `<tr class="${count ? "" : "zero"}"><td><span class="token">${esc(word)}</span></td><td class="num">${count}</td><td class="num">${df}</td><td class="num">${df ? weight.toFixed(2) : "-"}</td><td class="num">${count ? repeat.toFixed(2) : "-"}</td><td class="num"><b>${count ? (weight * repeat).toFixed(2) : "0"}</b></td></tr>`;
  }).join("");
  const changed = bm.k1 !== 1.2 || bm.b !== 0.75;
  $("#score-toy").innerHTML = `
    <div class="params">k1 = <b class="num">${bm.k1.toFixed(1)}</b>, b = <b class="num">${bm.b.toFixed(2)}</b>${changed ? ` <button class="btn small" id="bm-reset">Varsayılana dön (1.2, 0.75)</button>` : " (varsayılan)"}</div>
    <div class="score-split">
      <ol class="mini-results">${hits.map((hit, rank) => `<li data-id="${hit.passage.id}" class="${hit.passage.id === bm.picked ? "on" : ""}">
        <span class="rank num">${rank + 1}</span><span class="name">${esc(hit.passage.title.split(" > ").slice(-1)[0])}<small>${esc(hit.passage.title.split(" > ")[0])}</small></span>
        <span class="num">${hit.score.toFixed(2)}</span><span class="bar"><i style="width:${(hit.score / max) * 100}%"></i></span></li>`).join("")}</ol>
      <div class="breakdown">
        <div class="passage-text"><div class="chunk-title">${esc(passage.title)}</div>${markWords(passage.body, new Set(wanted), toyIndex.tokenize)}</div>
        <table><thead><tr><th>kelime</th><th>bu pasajda</th><th>df</th><th>IDF</th><th>tekrar puanı</th><th>katkı</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td colspan="5">BM25 puanı (katkıların toplamı)</td><td class="num"><b>${total.toFixed(2)}</b></td></tr></tfoot></table>
        <p class="overall">Bu pasaj ${length} kelime (ortalama ${toyIndex.averageLength.toFixed(0)}). Katkı = IDF × tekrar puanı. Pasajda geçmeyen kelime hiçbir şey getirmiyor.</p>
      </div>
    </div>`;
  for (const item of document.querySelectorAll("#score-toy .mini-results li")) item.onclick = () => { bm.picked = item.dataset.id; renderScoreToy(); };
  const reset = $("#bm-reset");
  if (reset) reset.onclick = () => { bm.k1 = 1.2; bm.b = 0.75; renderBm(); };
}

const TRIES = [
  { id: "e02", why: "\"kanal\" ve \"tedavisi\" doğru pasajda geçiyor ve \"kanal\" nadir: puanın çoğunu o getiriyor. \"fiyatı\" hiçbir pasajda yok (belgede \"fiyatlar\" yazıyor), ama bu soruda gerek kalmıyor." },
  { id: "m06", why: "Pasajda \"gecikmelerde\" yazıyor. BM25 için \"gecikirsem\" ile \"gecikmelerde\" iki ayrı kelime; geriye \"ne\" ve \"olur\" kalıyor; onlar da başka pasajlarda geçiyor ve yanlış pasajları öne getiriyor." },
  { id: "e07", why: "Fiyatın yazdığı pasajda \"İmplant: 25.000 TL\" var. Büyük \"İ\" küçük harfe çevrilirken bozuluyor ve kelime \"i\" ile \"mplant\" diye ikiye bölünüyor. Soruda ise \"implant\" var; o da sadece küçük harfle yazıldığı 2 başka pasajla eşleşiyor. Aynı kelime, BM25 için farklı." },
  { id: "p01", why: "Doğru pasajda \"otopark\" yazıyor. Soruyla tek bir ortak kelimesi yok: kelime araması anlamı bilmez." },
];

function renderTries() {
  $("#tries").innerHTML = TRIES.map(({ id, why }) => {
    const question = questions.get(id);
    const rows = LAB.results["bm25-naive/last"][id];
    const rank = Math.min(...question.targets.map((target) => rankIn(rows, target.passages) || Infinity));
    const top = rows.slice(0, 3).map((row, index) => {
      const hit = question.targets.some((target) => target.passages.includes(row[0]));
      return `<li class="${hit ? "found-row" : ""}"><span class="num">${index + 1}</span>${hit ? '<span class="tick">✓</span>' : ""}${esc(passages.get(row[0]).title.split(" > ").slice(-1)[0])}</li>`;
    }).join("");
    const status = rank <= 5 ? `<span class="where top">${rank}. sırada</span>` : `<span class="where lost">${rank === Infinity ? "ilk 20'de yok" : `${rank}. sırada`}</span>`;
    return `<div class="card try">
      <div class="try-head"><b>${esc(question.text)}</b>${status}</div>
      <div class="tokens">${tokenChips(question.text, indexes.naive)}</div>
      <ol class="try-top">${top}</ol>
      <p>${esc(why)}</p>
      <button class="btn small" data-text="${esc(question.text)}">Yukarıda adım adım incele ↑</button>
    </div>`;
  }).join("");
  for (const button of document.querySelectorAll("#tries button")) {
    button.onclick = () => {
      bm.query = button.dataset.text; bm.picked = null; bm.df = null;
      $("#bm-query").value = bm.query;
      renderBm();
      $("#bm-query").scrollIntoView({ block: "center" });
    };
  }
  const summary = LAB.metrics["bm25-naive/last"].all.summary;
  const answerable = LAB.questions.filter((question) => question.targets.length).length;
  $("#bm-gain").innerHTML = `<b>Kazanç.</b> Cevabı belgelerde olan ${answerable} sorunun yaklaşık ${Math.round(summary["recall@5"] * answerable)} tanesinde doğru pasaj BM25'in ilk 5 sonucu arasında (${pct(summary["recall@5"])}), ${Math.round(summary["recall@1"] * answerable)} tanesinde birinci sırada (${pct(summary["recall@1"])}). Rastgele 5 pasaj seçseydik bu oran ${pct(5 / LAB.passages.length)} olurdu. Kelime saymak, hiçbir şey bilmeden başlamak için şaşırtıcı derecede iyi; sonraki her bölüm bu sayıların üzerine ekliyor. (Sohbetin devamı olan sorular burada önceki mesaj olmadan arandı.)`;
}

function bestRank(question, stage) {
  const rows = LAB.results[stage][question.id];
  return Math.min(...question.targets.map((target) => rankIn(rows, target.passages) || Infinity));
}

const rankLabel = (rank) => (rank === Infinity ? "yok" : `${rank}.`);

const RANK_QUESTIONS = ["e01", "x02"];
const rankToy = { question: "e01", order: null };

function rankStart(id) {
  const question = questions.get(id);
  const rows = LAB.results["bm25-naive/last"][id];
  const order = rows.slice(0, 10).map((row) => row[0]);
  for (const target of question.targets) {
    if (!target.passages.some((passage) => order.includes(passage))) {
      order.push((rows.find((row) => target.passages.includes(row[0])) || [target.passages[0]])[0]);
    }
  }
  return order;
}

function renderRankToy() {
  const question = questions.get(rankToy.question);
  if (!rankToy.order) rankToy.order = rankStart(rankToy.question);
  const order = rankToy.order;
  const total = question.targets.length;
  const gains = gainsOf(question, order);
  const isTarget = (id) => question.targets.some((target) => target.passages.includes(id));
  const ranks = order.map((id, index) => [id, index + 1]).filter(([id]) => isTarget(id)).map(([, rank]) => rank);
  const items = order.map((id, index) => `${index === 10 ? '<li class="outside">ilk 10\'un dışı: nDCG@10 buradakileri saymaz</li>' : ""}
    <li class="${isTarget(id) ? "target" : ""}"><span class="num">${index + 1}</span><span class="name">${isTarget(id) ? '<span class="tick">✓</span> ' : ""}${esc(passages.get(id).title.split(" > ").slice(-1)[0])}</span>
      <button class="btn small" data-move="${index}" data-by="-1" ${index ? "" : "disabled"}>▲</button><button class="btn small" data-move="${index}" data-by="1" ${index < order.length - 1 ? "" : "disabled"}>▼</button></li>`).join("");
  const terms = gains.slice(0, 10).map((gain, index) => (gain ? `1/log₂(${index + 2}) = ${(1 / Math.log2(index + 2)).toFixed(2)}` : null)).filter(Boolean);
  const ideal = dcg(Array(Math.min(total, 10)).fill(1));
  const first = gains.findIndex((gain) => gain);
  const cards = [
    [term("recall1"), recallAt(gains, total, 1), `${gains.slice(0, 1).reduce((a, b) => a + b, 0)} / ${total} doğru pasaj ilk 1'de`],
    [term("recall5"), recallAt(gains, total, 5), `${gains.slice(0, 5).reduce((a, b) => a + b, 0)} / ${total} doğru pasaj ilk 5'te`],
    ["MRR", reciprocal(gains), first < 0 ? "hiç doğru pasaj yok" : `ilk doğru pasaj ${first + 1}. sırada: 1 / ${first + 1}`],
    [term("ndcg"), ndcgAt(gains, total, 10), `${terms.length ? terms.join(" + ") : "ilk 10'da doğru pasaj yok: 0"}${total > 1 || terms.length ? `; en iyi sıralamada ${ideal.toFixed(2)}, oranı` : ""}`],
  ];
  $("#rank-toy").innerHTML = `
    <div class="toy-controls"><div class="pills">${RANK_QUESTIONS.map((id) => `<button data-q="${id}" class="${id === rankToy.question ? "on" : ""}">${esc(questions.get(id).text)} <small>(${questions.get(id).targets.length} doğru pasaj)</small></button>`).join("")}</div></div>
    <div class="rank-split">
      <ol class="rank-list">${items}</ol>
      <div class="metric-cards">${cards.map(([name, value, why]) => `<div class="metric-card"><span>${name}</span><b class="num">${value.toFixed(2)}</b><small>${why}</small></div>`).join("")}
        <div class="row"><button class="btn small" id="rank-reset">BM25'in sıralaması</button><button class="btn small" id="rank-best">Mükemmel sıralama</button></div>
        <p class="overall">Doğru pasajların sırası: ${ranks.join(", ")}. Dene: doğru pasajı 1. sıradan 2. sıraya indir; recall@1 ve MRR yarıya iner, nDCG ise 0.63'e.</p>
      </div>
    </div>`;
  for (const button of document.querySelectorAll("#rank-toy [data-q]")) button.onclick = () => { rankToy.question = button.dataset.q; rankToy.order = null; renderRankToy(); };
  for (const button of document.querySelectorAll("#rank-toy [data-move]")) {
    button.onclick = () => {
      const from = Number(button.dataset.move), to = from + Number(button.dataset.by);
      [order[from], order[to]] = [order[to], order[from]];
      renderRankToy();
    };
  }
  $("#rank-reset").onclick = () => { rankToy.order = null; renderRankToy(); };
  $("#rank-best").onclick = () => { rankToy.order = [...order.filter(isTarget), ...order.filter((id) => !isTarget(id))]; renderRankToy(); };
}

function reportRows(stage) {
  const metrics = LAB.metrics[stage].all;
  return Object.keys(KINDS).filter((kind) => metrics.byKind[kind]).map((kind) => [kind, metrics.byKind[kind]]);
}

function renderReport() {
  const stage = "bm25-naive/last";
  const rows = reportRows(stage);
  const overall = LAB.metrics[stage].all.summary;
  const bar = (value) => `<span class="cell-bar"><i style="width:${value * 100}%"></i></span><span class="num">${value.toFixed(2)}</span>`;
  const weakest = [...rows].sort((one, other) => one[1]["recall@5"] - other[1]["recall@5"]);
  $("#report-toy").innerHTML = `<table class="report">
    <thead><tr><th>soru türü</th><th>soru</th><th>${term("recall1")}</th><th>${term("recall5")}</th><th>${term("ndcg")}</th></tr></thead>
    <tbody>${rows.map(([kind, values]) => `<tr class="${kind === weakest[0][0] ? "weak" : ""}"><td>${esc(KINDS[kind][0])}</td><td class="num">${values.count}</td><td>${bar(values["recall@1"])}</td><td>${bar(values["recall@5"])}</td><td>${bar(values["nDCG@10"])}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td>hepsi</td><td class="num">${rows.reduce((sum, [, values]) => sum + values.count, 0)}</td><td>${bar(overall["recall@1"])}</td><td>${bar(overall["recall@5"])}</td><td>${bar(overall["nDCG@10"])}</td></tr></tfoot></table>
    <p class="overall">"Cevabı yok" türündeki 5 soru burada yok: bulunacak bir pasajları olmadığı için bu sayılarla ölçülmezler. "Sohbetin devamı" soruları önceki mesaj olmadan arandı (Bölüm 8).</p>`;
  $("#report-limit").innerHTML = `<b>Sınırı.</b> Karne nereye bakacağımızı söylüyor. ${term("recall5")}'e göre en zayıf yerler: ${weakest.slice(0, 4).map(([kind, values]) => `"${esc(KINDS[kind][0])}" (${values["recall@5"].toFixed(2)})`).join(", ")}. En ucuzuyla başlayalım: "Başka ek", yani Türkçe ekler.`;
}

const TOKENIZER_ROWS = [
  ["naive", "Bölüm 2'deki: str.lower(), harf ve rakam dizileri"],
  ["turkce", "Türkçe büyük harf, sayılar tek parça"],
  ["f5", "+ her kelimenin ilk 5 harfi"],
  ["snowball", "+ Snowball kök bulucu"],
  ["trigram", "+ 3 harflik örtüşen parçalar"],
];
const tokenToy = { text: "Gecikirsem ne olur?" };

function chips(words) {
  return words.length ? words.map((word) => `<span class="token">${esc(word)}</span>`).join("") : '<span class="overall">kelime yok</span>';
}

function renderTokenToy() {
  const known = LAB.tokenizers.samples[tokenToy.text];
  const rows = TOKENIZER_ROWS.map(([name, label]) => {
    const words = tokenizers[name] ? tokenizers[name](tokenToy.text) : known && known[name];
    const cell = words ? chips(words) : '<span class="overall">Snowball tarayıcıda çalışmıyor; yukarıdaki örneklerden birini seç.</span>';
    return `<div class="token-row"><div><b>${esc(name === "turkce" ? "Türkçe" : name === "naive" ? "naive" : name === "f5" ? "İlk 5 harf (F5)" : name === "snowball" ? "Snowball" : "Trigram")}</b><small>${esc(label)}</small></div><div class="tokens">${cell}</div></div>`;
  }).join("");
  $("#token-toy").innerHTML = `
    <input class="wide-input" id="token-input" value="${esc(tokenToy.text)}" autocomplete="off">
    <div class="suggest">${Object.keys(LAB.tokenizers.samples).map((text) => `<button data-text="${esc(text)}">${esc(text)}</button>`).join("")}</div>
    <div class="token-rows">${rows}</div>`;
  const input = $("#token-input");
  input.oninput = () => { tokenToy.text = input.value; const focus = input.selectionStart; renderTokenToy(); const again = $("#token-input"); again.focus(); again.setSelectionRange(focus, focus); };
  for (const button of document.querySelectorAll("#token-toy .suggest button")) button.onclick = () => { tokenToy.text = button.dataset.text; renderTokenToy(); };
}

function renderPairToy() {
  const names = TOKENIZER_ROWS.map(([name]) => name);
  const heads = { naive: "naive", turkce: "Türkçe", f5: "İlk 5 harf", snowball: "Snowball", trigram: "Trigram" };
  const rows = LAB.tokenizers.pairs.map((pair, index) => {
    const falseFriend = index === LAB.tokenizers.pairs.length - 1;
    const cells = names.map((name) => {
      const [asked, written] = pair.words[name];
      const shared = asked.filter((word) => written.includes(word));
      let verdict;
      if (name === "trigram") {
        const share = new Set(shared).size / new Set([...asked, ...written]).size;
        verdict = `<span class="${share >= 0.5 ? (falseFriend ? "bad" : "good") : "faint"}">%${Math.round(share * 100)} ortak</span>`;
      } else {
        verdict = shared.length ? `<span class="${falseFriend ? "bad" : "good"}">✓${falseFriend ? " ama yanlış" : ""}</span>` : '<span class="faint">✗</span>';
      }
      const shown = name === "trigram" ? `${asked.length} · ${written.length} parça` : `${asked.join(" ")} · ${written.join(" ")}`;
      return `<td title="${esc(asked.join(" "))} ↔ ${esc(written.join(" "))}"><div class="pair-words">${esc(shown)}</div>${verdict}</td>`;
    }).join("");
    return `<tr class="${falseFriend ? "false-friend" : ""}"><th>${esc(pair.question)} <span class="faint">↔</span> ${esc(pair.passage)}${falseFriend ? '<small>aynı şey değil</small>' : ""}</th>${cells}</tr>`;
  }).join("");
  $("#pair-toy").innerHTML = `<div class="table-scroll"><table class="pairs"><thead><tr><th>soru ↔ belge</th>${names.map((name) => `<th>${heads[name]}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="overall">Her hücrede iki kelimenin o yöntemle neye dönüştüğü ve buluşup buluşmadığı. Trigram'da iki kelimenin parçalarının yüzde kaçı ortak. Snowball "Hekimleriniz"i fazla kesip "hek" yapıyor; "Taksitle" ilk 5 harfte "taksi" oluyor (taksiyle de buluşur).</p>`;
}

function renderBeforeAfter(fromStage, toStage, element, labels) {
  const changed = LAB.questions.filter((question) => question.targets.length)
    .map((question) => [question, bestRank(question, fromStage), bestRank(question, toStage)])
    .filter(([, before, after]) => before !== after)
    .sort((one, other) => (1 / one[2] - 1 / one[1]) < (1 / other[2] - 1 / other[1]) ? 1 : -1);
  const better = changed.filter(([, before, after]) => after < before).length;
  const worse = changed.length - better;
  const answerable = LAB.questions.filter((question) => question.targets.length).length;
  $(element).innerHTML = `<div class="toy-verdict"><b class="good">${better} soru iyileşti</b>, <b class="bad">${worse} soru kötüleşti</b>, ${answerable - changed.length} soruda doğru pasajın sırası değişmedi.</div>
    <div class="table-scroll"><table class="changes"><thead><tr><th>soru</th><th>${esc(labels[0])}</th><th></th><th>${esc(labels[1])}</th></tr></thead><tbody>
    ${changed.map(([question, before, after]) => `<tr><td>${esc(question.text)} <span class="faint">${esc(KINDS[question.kind][0])}</span></td><td class="num">${rankLabel(before)}</td><td class="${after < before ? "good" : "bad"}">${after < before ? "↑" : "↓"}</td><td class="num">${rankLabel(after)}</td></tr>`).join("")}
    </tbody></table></div><p class="overall">Sıra: doğru pasajın (birden fazlaysa en üsttekinin) kaçıncı geldiği; "yok": ilk 20'de yok.</p>`;
}

function metricShift(fromStage, toStage, kind) {
  const [before, after] = [LAB.metrics[fromStage].all, LAB.metrics[toStage].all];
  const shift = (metric) => `${before.summary[metric].toFixed(2)} → <b>${after.summary[metric].toFixed(2)}</b>`;
  const kindShift = `${before.byKind[kind]["recall@5"].toFixed(2)} → <b>${after.byKind[kind]["recall@5"].toFixed(2)}</b>`;
  return { r1: shift("recall@1"), r5: shift("recall@5"), ndcg: shift("nDCG@10"), kind: kindShift };
}

function renderF5() {
  renderBeforeAfter("bm25-naive/last", "bm25-f5/last", "#f5-toy", ["naive", "ilk 5 harf"]);
  const shift = metricShift("bm25-naive/last", "bm25-f5/last", "morphology");
  $("#f5-gain").innerHTML = `<b>Kazanç.</b> ${term("recall5")}: ${shift.r5}, ${term("recall1")}: ${shift.r1}, ${term("ndcg")}: ${shift.ndcg}. "Başka ek" sorularında recall@5 ${shift.kind}. Arama motoruna dokunmadan, sadece kelimeleri ayırma şeklini değiştirerek. Bedeli de görünüyor: kötüleşen sorular var, çünkü kaba kesim alakasız kelimeleri de birleştiriyor.`;
}

const cosineToy = { angle: 40 };

function renderCosineToy() {
  const size = 260, center = 130, length = 105;
  const first = 15, second = first + cosineToy.angle;
  const point = (degrees) => [center + length * Math.cos((degrees * Math.PI) / 180), center - length * Math.sin((degrees * Math.PI) / 180)];
  const [ax, ay] = point(first), [bx, by] = point(second);
  const value = Math.cos((cosineToy.angle * Math.PI) / 180);
  const arc = `M${center + 34 * Math.cos((first * Math.PI) / 180)},${center - 34 * Math.sin((first * Math.PI) / 180)} A34,34 0 ${cosineToy.angle > 180 ? 1 : 0},0 ${center + 34 * Math.cos((second * Math.PI) / 180)},${center - 34 * Math.sin((second * Math.PI) / 180)}`;
  const meaning = value > 0.9 ? "neredeyse aynı anlam" : value > 0.5 ? "benzer" : value > 0.1 ? "biraz ilgili" : value > -0.1 ? "ilgisiz (dik)" : "ters yön";
  $("#cosine-toy").innerHTML = `<div class="toy-split narrow">
    <svg viewBox="0 0 ${size} ${size}" class="plot cosine"><defs><marker id="head" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z"/></marker></defs>
      <circle cx="${center}" cy="${center}" r="${length}" class="ring"/><path d="${arc}" class="angle"/>
      <line x1="${center}" y1="${center}" x2="${ax}" y2="${ay}" class="arrow one" marker-end="url(#head)"/><text x="${ax + 6}" y="${ay + 4}" class="dot-label">pasaj</text>
      <line x1="${center}" y1="${center}" x2="${bx}" y2="${by}" class="arrow two" marker-end="url(#head)"/><text x="${bx + 6}" y="${by - 4}" class="dot-label">soru</text></svg>
    <div class="toy-side">
      <label class="slider"><span>açı = <b class="num">${cosineToy.angle}°</b></span><input type="range" min="0" max="180" value="${cosineToy.angle}" id="cosine-angle"></label>
      <div class="formula">cosine = cos(${cosineToy.angle}°) = <b>${value.toFixed(2)}</b>: ${meaning}</div>
      <p>Vektörlerin uzunluğu 1'e eşitlenince cosine, iki listenin aynı sıradaki sayılarının çarpımlarının toplamı oluyor: 384 çarpma ve bir toplama. Bu yüzden 55 pasajın hepsiyle karşılaştırmak bir milisaniyeden kısa sürüyor. e5'in puanları pratikte dar bir aralıkta (0.80-0.90) toplanıyor: önemli olan sıralama, sayının kendisi değil.</p>
    </div></div>`;
  const slider = $("#cosine-angle");
  slider.oninput = () => { cosineToy.angle = Number(slider.value); renderCosineToy(); };
}

const MAP_QUESTIONS = ["p04", "p01", "p03", "p06", "m01", "e08"];
const DOC_COLORS = ["#2f5bea", "#0f9f8f", "#d97706", "#8b5cf6", "#e0457b", "#16a34a", "#0891b2", "#b45309", "#7c3aed", "#be123c", "#4d7c0f", "#475569"];
const meaningToy = { question: "p04" };

function renderMeaningToy() {
  const question = questions.get(meaningToy.question);
  const points = LAB.map.passages, asked = LAB.map.questions;
  const all = [...Object.values(points), ...Object.values(asked)];
  const [minX, maxX] = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
  const [minY, maxY] = [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))];
  const width = 720, height = 440, pad = 24;
  const x = (value) => pad + ((value - minX) / (maxX - minX)) * (width - 2 * pad);
  const y = (value) => pad + ((maxY - value) / (maxY - minY)) * (height - 2 * pad);
  const documents = [...new Set(LAB.passages.map((passage) => passage.document))];
  const color = (passage) => DOC_COLORS[documents.indexOf(passage.document) % DOC_COLORS.length];
  const nearest = LAB.results["e5/last"][question.id].slice(0, 5).map((row) => row[0]);
  const isTarget = (id) => question.targets.some((target) => target.passages.includes(id));
  const [qx, qy] = asked[question.id];
  const lines = nearest.map((id, index) => `<line x1="${x(qx)}" y1="${y(qy)}" x2="${x(points[id][0])}" y2="${y(points[id][1])}" class="near ${isTarget(id) ? "target" : ""}"/><text x="${x(points[id][0]) + 8}" y="${y(points[id][1]) - 6}" class="near-rank">${index + 1}</text>`).join("");
  const dots = LAB.passages.map((passage) => `<circle cx="${x(points[passage.id][0])}" cy="${y(points[passage.id][1])}" r="${isTarget(passage.id) ? 9 : 6}" fill="${color(passage)}" class="${isTarget(passage.id) ? "target" : ""} ${nearest.includes(passage.id) ? "near-dot" : ""}"><title>${esc(passage.title)}</title></circle>`).join("");
  const star = `<path d="M${x(qx)},${y(qy) - 11} L${x(qx) + 3.5},${y(qy) - 3.5} L${x(qx) + 11},${y(qy) - 3} L${x(qx) + 5},${y(qy) + 2.5} L${x(qx) + 7},${y(qy) + 10} L${x(qx)},${y(qy) + 6} L${x(qx) - 7},${y(qy) + 10} L${x(qx) - 5},${y(qy) + 2.5} L${x(qx) - 11},${y(qy) - 3} L${x(qx) - 3.5},${y(qy) - 3.5} z" class="star"/>`;
  const list = (stage, label) => {
    const rows = LAB.results[stage][question.id].slice(0, 5);
    return `<div><div class="label">${label}</div><ol class="try-top">${rows.map((row, index) => `<li class="${isTarget(row[0]) ? "found-row" : ""}"><span class="num">${index + 1}</span>${isTarget(row[0]) ? '<span class="tick">✓</span>' : ""}${esc(passages.get(row[0]).title.split(" > ").slice(-1)[0])}</li>`).join("")}</ol></div>`;
  };
  const [lexical, meaning] = [bestRank(question, "bm25-f5/last"), bestRank(question, "e5/last")];
  $("#meaning-toy").innerHTML = `
    <div class="pills">${MAP_QUESTIONS.map((id) => `<button data-q="${id}" class="${id === meaningToy.question ? "on" : ""}">${esc(questions.get(id).text)}</button>`).join("")}</div>
    <svg viewBox="0 0 ${width} ${height}" class="meaning-map">${lines}${dots}${star}</svg>
    <div class="map-legend">${documents.map((document) => { const passage = LAB.passages.find((item) => item.document === document); return `<span><i style="background:${color(passage)}"></i>${esc(passage.title.split(" > ")[0])}</span>`; }).join("")}</div>
    <div class="toy-verdict">Doğru pasaj: kelime aramasında (BM25-F5) <b>${rankLabel(lexical)}</b>${lexical === Infinity ? "" : " sırada"}, anlam aramasında (e5) <b>${rankLabel(meaning)}</b>${meaning === Infinity ? "" : " sırada"}.</div>
    <div class="side-by-side">${list("bm25-f5/last", "Kelime araması (BM25-F5), ilk 5")}${list("e5/last", "Anlam araması (e5), ilk 5")}</div>`;
  for (const button of document.querySelectorAll("#meaning-toy [data-q]")) button.onclick = () => { meaningToy.question = button.dataset.q; renderMeaningToy(); };
}

function renderE5() {
  $("#map-intro").innerHTML = `Her nokta bir pasaj, renkler belgeler. 384 boyutu ekrana sığdırmak için ${term("pca", "PCA")} ile iki boyuta indirdik; bilginin sadece ${pct(LAB.map.kept)} kadarı kalıyor, yani harita kaba bir gölge. Bir soru seç: yıldız sorunun yeri, çizgiler ona gerçekten (384 boyutta) en yakın 5 pasaj. Yeşil halkalı nokta doğru pasaj. Haritada uzak görünen bir pasajın 384 boyutta yakın olması bu yüzden.`;
  const shift = metricShift("bm25-f5/last", "e5/last", "paraphrase");
  const answerable = LAB.questions.filter((question) => question.targets.length);
  const meaningWins = answerable.filter((question) => bestRank(question, "e5/last") < bestRank(question, "bm25-f5/last")).length;
  const wordsWin = answerable.filter((question) => bestRank(question, "bm25-f5/last") < bestRank(question, "e5/last")).length;
  $("#e5-gain").innerHTML = `<b>Kazanç.</b> Bölüm 4'teki kelime aramasına göre ${term("recall5")}: ${shift.r5}, ${term("recall1")}: ${shift.r1}, ${term("ndcg")}: ${shift.ndcg}. "Başka kelimeler" sorularında recall@5 ${shift.kind}. Ama asıl ilginç olan: ${meaningWins} soruda anlam araması doğru pasajı daha üstte getiriyor, ${wordsWin} soruda kelime araması. İkisi farklı sorularda kazanıp kaybediyor.`;
}


const short = (text, size = 34) => (Array.from(text).length > size ? `${Array.from(text).slice(0, size - 1).join("")}…` : text);
const lastTitle = (id) => passages.get(id).title.split(" > ").slice(-1)[0];
const answerableQuestions = () => LAB.questions.filter((question) => question.targets.length);

function wins(better, worse) {
  return answerableQuestions().filter((question) => bestRank(question, better) < bestRank(question, worse)).length;
}

const FUSION_QUESTIONS = ["e08", "p04", "p03", "x02", "m07"];
const fusionToy = { question: "e08" };

function renderFusionProblem() {
  const e08 = questions.get("e08"), p04 = questions.get("p04");
  $("#fusion-problem").innerHTML = `<b>Sorun.</b> Bölüm 5'in sonunda gördük: ${wins("e5/last", "bm25-f5/last")} soruda anlam araması, ${wins("bm25-f5/last", "e5/last")} soruda kelime araması daha iyi. "${esc(e08.text)}" sorusunda doğru pasaj kelime aramasında ${rankLabel(bestRank(e08, "bm25-f5/last"))} sırada, anlam aramasında ${rankLabel(bestRank(e08, "e5/last"))} sırada; "${esc(p04.text)}" sorusunda tam tersi. Hangisini seçeceğimizi soru gelmeden bilemiyoruz. İkisini birden çalıştırıp listelerini birleştirebilir miyiz?`;
}

function renderFusionToy() {
  const question = questions.get(fusionToy.question);
  const isTarget = (id) => question.targets.some((target) => target.passages.includes(id));
  const lexical = LAB.lists["bm25-f5"][question.id], vector = LAB.lists.e5[question.id];
  const position = (list, id) => { const index = list.findIndex(([passage]) => passage === id); return index < 0 ? null : index + 1; };
  const fused = rrf([lexical, vector]).slice(0, 10);
  const side = (list, label) => `<div><div class="label">${label}</div><ol class="try-top">${list.slice(0, 8).map(([id], index) => `<li class="${isTarget(id) ? "found-row" : ""}"><span class="num">${index + 1}</span>${isTarget(id) ? '<span class="tick">✓</span>' : ""}${esc(short(lastTitle(id), 28))}</li>`).join("")}</ol></div>`;
  const share = (rank) => (rank ? `1/(60+${rank})` : "listede yok");
  const middle = `<div><div class="label">Birleşik liste (RRF)</div><ol class="fused">${fused.map(([id, score], index) => {
    const [one, two] = [position(lexical, id), position(vector, id)];
    return `<li class="${isTarget(id) ? "target" : ""}"><span class="num">${index + 1}</span><div><b>${isTarget(id) ? '<span class="tick">✓</span> ' : ""}${esc(lastTitle(id))}</b>
      <small class="num">${share(one)} + ${share(two)} = ${score.toFixed(4)}</small></div></li>`;
  }).join("")}</ol></div>`;
  $("#fusion-toy").innerHTML = `
    <div class="pills">${FUSION_QUESTIONS.map((id) => `<button data-q="${id}" class="${id === fusionToy.question ? "on" : ""}">${esc(questions.get(id).text)}</button>`).join("")}</div>
    <div class="three-columns">${side(lexical, "Kelime (BM25-F5)")}${middle}${side(vector, "Anlam (e5)")}</div>
    <p class="overall">Birleşik listedeki her satırda: pasajın kelime listesindeki ve anlam listesindeki sırasının payları. İki listeye de giren pasaj, tek listede birinci olandan çoğu zaman önde.</p>`;
  for (const button of document.querySelectorAll("#fusion-toy [data-q]")) button.onclick = () => { fusionToy.question = button.dataset.q; renderFusionToy(); };
}

const alphaToy = { alpha: 0.4, curve: null };

function meanNdcg(rank) {
  const scored = answerableQuestions().map((question) => ndcgAt(gainsOf(question, rank(question).slice(0, 10).map(([id]) => id)), question.targets.length, 10));
  return scored.reduce((sum, value) => sum + value, 0) / scored.length;
}

function renderAlphaToy() {
  if (!alphaToy.curve) {
    alphaToy.curve = Array.from({ length: 21 }, (_, index) => {
      const alpha = index / 20;
      return [alpha, meanNdcg((question) => weighted(LAB.lists["bm25-f5"][question.id], LAB.lists.e5[question.id], alpha))];
    });
  }
  const fused = LAB.metrics["rrf/last"].all.summary["nDCG@10"];
  const values = alphaToy.curve.map(([, value]) => value);
  const low = Math.floor(Math.min(...values, fused) * 20) / 20, high = Math.ceil(Math.max(...values, fused) * 20) / 20;
  const chart = plot({ xs: [0, 1], ys: [low, high], xLabel: "α (0: sadece anlam, 1: sadece kelime)", yLabel: "nDCG@10", xTicks: [0, 0.2, 0.4, 0.6, 0.8, 1], xFormat: (value) => value.toFixed(1), yDigits: 3 });
  const line = alphaToy.curve.map(([alpha, value], index) => `${index ? "L" : "M"}${chart.x(alpha).toFixed(1)},${chart.y(value).toFixed(1)}`).join(" ");
  const current = alphaToy.curve[Math.round(alphaToy.alpha * 20)][1];
  const [bestAlpha, bestValue] = alphaToy.curve.reduce((best, point) => (point[1] > best[1] ? point : best));
  $("#alpha-toy").innerHTML = `<div class="toy-split">
    ${chart.svg(`<line class="ceiling" x1="${chart.x(0)}" x2="${chart.x(1)}" y1="${chart.y(fused)}" y2="${chart.y(fused)}"/><text class="dot-label faint" x="${chart.x(1) - 4}" y="${chart.y(fused) - 6}" text-anchor="end">RRF: ${fused.toFixed(3)}</text>
      <path class="curve" d="${line}"/><circle class="dot" cx="${chart.x(alphaToy.alpha)}" cy="${chart.y(current)}" r="6"/>`)}
    <div class="toy-side">
      <label class="slider"><span>α = <b class="num">${alphaToy.alpha.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.05" value="${alphaToy.alpha}" id="alpha-slider"></label>
      <div class="formula">puan = ${alphaToy.alpha.toFixed(2)} × kelime + ${(1 - alphaToy.alpha).toFixed(2)} × anlam<br>nDCG@10 = <b>${current.toFixed(3)}</b></div>
      <p>Bu sorularda en iyi α = ${bestAlpha.toFixed(2)} (nDCG ${bestValue.toFixed(3)}); RRF hiç ayarsız ${fused.toFixed(3)}. Ağırlıklı toplama iyi ayarlanırsa yaklaşabiliyor, ama doğru α'yı bulmak için etiketli sorular gerekiyor ve o α başka bir veri setinde başka çıkıyor (laboratuvar notuna bak).</p>
    </div></div>`;
  const slider = $("#alpha-slider");
  slider.oninput = () => { alphaToy.alpha = Number(slider.value); renderAlphaToy(); };
}

function renderRrf() {
  renderBeforeAfter("e5/last", "rrf/last", "#rrf-toy", ["anlam (e5)", "hibrit (RRF)"]);
  const shift = metricShift("e5/last", "rrf/last", "exact");
  const deep = answerableQuestions().map((question) => recallAt(gainsOf(question, LAB.results["rrf/last"][question.id].map(([id]) => id)), question.targets.length, 20));
  const within = deep.reduce((sum, value) => sum + value, 0) / deep.length;
  $("#rrf-gain").innerHTML = `<b>Kazanç.</b> Anlam aramasına göre ${term("recall5")}: ${shift.r5}, ${term("recall1")}: ${shift.r1}, ${term("ndcg")}: ${shift.ndcg}. Daha önemlisi: doğru pasaj artık ${pct(within)} oranında ilk 20'de. Bulmak neredeyse çözüldü; kalan iş sıralamak.`;
  const e08 = questions.get("e08");
  const missed = answerableQuestions().filter((question) => { const rank = bestRank(question, "rrf/last"); return rank > 5 && rank <= 20; }).length;
  $("#rrf-limit").innerHTML = `<b>Sınırı.</b> "${esc(e08.text)}" sorusunun cevabı hibrit listede ${rankLabel(bestRank(e08, "rrf/last"))} sırada: iki listenin ortası. ${missed} soruda doğru pasaj ilk 20'de ama ilk 5'te değil. Modele 5 pasaj gidiyorsa bunlar hiç gitmiyor. İki arama da soruyu ve pasajı ayrı ayrı okuyor; birlikte okuyan biri gerekiyor.`;
}

const RERANK_QUESTIONS = ["e08", "p06", "x02", "s01", "m07"];
const rerankToy = { question: "e08" };

function renderRerankToy() {
  const question = questions.get(rerankToy.question);
  const isTarget = (id) => question.targets.some((target) => target.passages.includes(id));
  const before = LAB.results["rrf/last"][question.id].map(([id]) => id);
  const after = LAB.results["jev/last"][question.id];
  const shown = 10, row = 30, top = 38, width = 760, leftX = 300, rightX = 460;
  const y = (index) => top + index * row;
  let deeper = 0;
  const lines = after.slice(0, shown).map(([id], index) => {
    const from = before.indexOf(id);
    const fromY = from < shown ? y(from) : y(shown) + 8 + 18 * deeper++;
    return `<path class="slope ${isTarget(id) ? "target" : ""}" d="M${leftX + 8},${fromY} C${(leftX + rightX) / 2},${fromY} ${(leftX + rightX) / 2},${y(index)} ${rightX - 8},${y(index)}"/>${from >= shown ? `<text class="dot-label faint" x="${leftX - 4}" y="${fromY + 4}" text-anchor="end">RRF'de ${from + 1}.</text>` : ""}`;
  }).join("");
  const left = before.slice(0, shown).map((id, index) => `<text x="${leftX}" y="${y(index) + 4}" text-anchor="end" class="slope-label ${isTarget(id) ? "target" : ""}">${index + 1}. ${esc(short(lastTitle(id)))}</text>`).join("");
  const right = after.slice(0, shown).map(([id, chance], index) => `<text x="${rightX}" y="${y(index) + 4}" class="slope-label ${isTarget(id) ? "target" : ""}">${index + 1}. ${esc(short(lastTitle(id)))} <tspan class="chance">${chance.toFixed(2)}</tspan></text>`).join("");
  const height = y(shown) + 24 + 18 * Math.max(0, deeper - 1);
  $("#rerank-toy").innerHTML = `
    <div class="pills">${RERANK_QUESTIONS.map((id) => `<button data-q="${id}" class="${id === rerankToy.question ? "on" : ""}">${esc(questions.get(id).text)}</button>`).join("")}</div>
    <svg viewBox="0 0 ${width} ${height}" class="slope-chart"><text x="${leftX}" y="14" text-anchor="end" class="label-svg">HİBRİT (RRF)</text><text x="${rightX}" y="14" class="label-svg">JEV'DEN SONRA · OLASILIK</text>${lines}${left}${right}</svg>
    <div class="toy-verdict">Doğru pasaj: hibrit aramada ${rankLabel(bestRank(question, "rrf/last"))}${bestRank(question, "rrf/last") === Infinity ? "" : " sırada"}, Jev'den sonra ${rankLabel(bestRank(question, "jev/last"))}${bestRank(question, "jev/last") === Infinity ? "" : " sırada"}.</div>`;
  for (const button of document.querySelectorAll("#rerank-toy [data-q]")) button.onclick = () => { rerankToy.question = button.dataset.q; renderRerankToy(); };
}

const SIGNALS = {
  jev: { label: "Jev olasılığı", stage: "jev/last", start: 0.69 },
  rrf: { label: "RRF puanı", stage: "rrf/last" },
  bm25: { label: "BM25 puanı", stage: "bm25-f5/last" },
};
const thresholdToy = { signal: "jev", threshold: 0.69 };

function bestThreshold(points) {
  const values = [...new Set(points.map(([value]) => value))].sort((one, other) => one - other);
  let best = [values[0] - 1e-9, 0];
  values.forEach((value, index) => {
    const threshold = index ? (value + values[index - 1]) / 2 : value - 1e-9;
    const correct = points.filter(([score, answerable]) => (answerable ? score >= threshold : score < threshold)).length;
    if (correct > best[1]) best = [threshold, correct];
  });
  return best;
}

function renderThresholdToy() {
  const signal = SIGNALS[thresholdToy.signal];
  const points = LAB.questions.map((question) => { const rows = LAB.results[signal.stage][question.id]; return [rows.length ? rows[0][1] : 0, question.targets.length > 0, question]; });
  const values = points.map(([value]) => value);
  const [low, high] = [Math.min(...values), Math.max(...values)];
  const width = 720, left = 30, right = 30;
  const x = (value) => left + ((value - low) / (high - low || 1)) * (width - left - right);
  const threshold = thresholdToy.threshold;
  const dots = points.map(([value, answerable, question], index) => `<circle cx="${x(value)}" cy="${(answerable ? 46 : 112) + ((index * 7) % 15) - 7}" r="6" class="${answerable ? "yes" : "no"} ${(answerable ? value >= threshold : value < threshold) ? "" : "wrong"}"><title>${esc(question.text)}: ${value.toFixed(3)}</title></circle>`).join("");
  const refused = points.filter(([value]) => value < threshold);
  const rightNo = refused.filter(([, answerable]) => !answerable).length;
  const wrongNo = refused.length - rightNo;
  const madeUp = points.filter(([value, answerable]) => !answerable && value >= threshold).length;
  const correct = points.length - wrongNo - madeUp;
  const [bestAt, bestCorrect] = bestThreshold(points);
  const always = points.filter(([, answerable]) => answerable).length;
  $("#threshold-toy").innerHTML = `
    <div class="row"><div class="switch">${Object.entries(SIGNALS).map(([id, item]) => `<button data-signal="${id}" class="${id === thresholdToy.signal ? "on" : ""}">${esc(item.label)}</button>`).join("")}</div></div>
    <svg viewBox="0 0 ${width} 150" class="threshold-strip">
      <rect x="${left}" y="28" width="${Math.max(0, x(threshold) - left)}" height="100" class="refuse-zone"/>
      <text x="${left}" y="22" class="label-svg">CEVABI BELGELERDE VAR</text><text x="${left + 4}" y="88" class="label-svg">CEVABI YOK</text>
      ${dots}<line x1="${x(threshold)}" x2="${x(threshold)}" y1="24" y2="132" class="threshold-line"/>
      <text x="${x(threshold) + 6}" y="144" class="dot-label">eşik ${threshold.toFixed(threshold < 1 ? 3 : 2)}</text></svg>
    <label class="slider"><span>eşik: altında kalanlar için "bilmiyorum"</span><input type="range" min="${low}" max="${high}" step="${(high - low) / 400}" value="${threshold}" id="threshold-slider"></label>
    <div class="toy-verdict"><b>${correct} / ${points.length} doğru.</b> "Bilmiyorum" dedi: ${refused.length} soru, ${rightNo} tanesinin cevabı gerçekten yoktu${wrongNo ? `, <span class="bad">${wrongNo} tanesinin cevabı vardı</span>` : ""}. ${madeUp ? `<span class="bad">Cevabı olmayan ${madeUp} soruya cevap vermeye kalktı.</span>` : "Cevabı olmayan her soruyu yakaladı."} Bu sinyalle en iyi eşik ${bestAt.toFixed(3)}: ${bestCorrect} / ${points.length}. Karşılaştırma için hiç "bilmiyorum" dememek: ${always} / ${points.length}.</div>
    <p class="overall">Noktaların üzerine gel, soruyu gör. Sohbetin devamı olan sorular burada önceki mesaj olmadan arandı.</p>`;
  for (const button of document.querySelectorAll("#threshold-toy [data-signal]")) {
    button.onclick = () => {
      thresholdToy.signal = button.dataset.signal;
      const next = SIGNALS[thresholdToy.signal];
      thresholdToy.threshold = next.start ?? bestThreshold(LAB.questions.map((question) => { const rows = LAB.results[next.stage][question.id]; return [rows.length ? rows[0][1] : 0, question.targets.length > 0]; }))[0];
      renderThresholdToy();
    };
  }
  const slider = $("#threshold-slider");
  slider.oninput = () => { thresholdToy.threshold = Number(slider.value); renderThresholdToy(); };
}

function renderRerankerTable() {
  const rows = [
    ["Rerank yok (RRF)", "0.868", "-", "-", "-"],
    ["bge-reranker-v2-m3 (yerel, açık model)", "0.929", "2.2 sn (işlemcide)", "ücretsiz", "hayır"],
    ["Luna (pasajları numaralı alıp sıralayan dil modeli)", "0.973", "8.1 sn", "~$0.001", "evet (OpenAI)"],
    ["Jev (her pasaja evet/hayır olasılığı)", "0.973", "0.4 sn", "~$0.0004", "evet (OpenRouter → TypeSafe)"],
  ];
  $("#reranker-table").innerHTML = `<div class="table-scroll"><table class="report"><thead><tr><th>reranker</th><th>${term("ndcg")} (42 soru)</th><th>soru başına süre</th><th>soru başına maliyet</th><th>metin dışarı çıkıyor mu?</th></tr></thead>
    <tbody>${rows.map((cells) => `<tr>${cells.map((cell, index) => `<td class="${index ? "num" : ""}">${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    <p class="overall">Laboratuvarın Ders 7'deki ölçümü, o günkü 42 soruda. Yerel bir model (bge) için hızlı olmak istiyorsan ekran kartı gerekir; dışarıdaki bir model için müşterinin metninin dışarı gittiğini söylemen ve izin alman.</p>`;
}

function renderJev() {
  renderBeforeAfter("rrf/last", "jev/last", "#jev-toy", ["hibrit", "+ Jev"]);
  const shift = metricShift("rrf/last", "jev/last", "paraphrase");
  $("#jev-gain").innerHTML = `<b>Kazanç.</b> ${term("recall1")}: ${shift.r1}, ${term("recall5")}: ${shift.r5}, ${term("ndcg")}: ${shift.ndcg}. Şimdiye kadarki en büyük sıçrama. Bedeli: soru başına yaklaşık 0.4 saniye ve $0.0004, ve soruyla 20 pasajın metni bir dış servise gidiyor. Servis erişilemezse hibrit aramanın sırasına düşmek kalite kaybettirir ama aramayı durdurmaz.`;
  const f02 = questions.get("f02");
  $("#jev-limit").innerHTML = `<b>Sınırı.</b> "${esc(f02.text)}" Doğru pasaj Jev'den sonra bile ${bestRank(f02, "jev/last") === Infinity ? "ilk 20'de yok" : `${bestRank(f02, "jev/last")}. sırada`}. Reranker sadece önüne gelen 20 adayı sıralayabilir; soru eksikse ilk arama doğru adayı hiç getirmez. Sorun pasajlarda değil, soruda: neyin süresi?`;
}

const chatToy = { question: "f02" };

function renderChatToy() {
  const question = questions.get(chatToy.question);
  const isTarget = (id) => question.targets.some((target) => target.passages.includes(id));
  const followups = LAB.questions.filter((item) => item.history.length);
  const columns = LAB.modes.map((mode) => {
    const rows = LAB.results[`jev/${mode.id}`][question.id];
    const rank = bestRank(question, `jev/${mode.id}`);
    return `<div class="card mode-column"><div class="label">${esc(mode.label)}</div>
      <div class="query-text">${esc(queryOf(question, mode.id))}</div>
      <span class="where ${rank <= 5 ? "top" : "lost"}">${rank === Infinity ? "ilk 20'de yok" : `${rank}. sırada`}</span>
      <ol class="try-top">${rows.slice(0, 3).map(([id], index) => `<li class="${isTarget(id) ? "found-row" : ""}"><span class="num">${index + 1}</span>${isTarget(id) ? '<span class="tick">✓</span>' : ""}${esc(short(lastTitle(id), 30))}</li>`).join("")}</ol></div>`;
  }).join("");
  const story = question.id === "f09" ? `<div class="callout limit"><b>"Tutmak" vakası.</b> Türkçede "Ne kadar tutuyor?" hem "fiyatı ne?" hem "ne kadar dayanır?" demek. Luna sorguyu "Diş implantı ne kadar tutuyor?" diye yazdı ve ikinci anlama kaydı. Geçmişi olduğu gibi eklemek belirsizliği reranker'a bıraktı; reranker fiyat pasajını doğru okudu.</div>` : "";
  $("#chat-toy").innerHTML = `
    <select id="chat-select" class="wide-select">${followups.map((item) => `<option value="${item.id}" ${item.id === question.id ? "selected" : ""}>${esc(item.history.join(" "))} → ${esc(item.text)}</option>`).join("")}</select>
    <div class="chat">${question.history.map((message) => `<div class="bubble"><small>önceki mesaj</small>${esc(message)}</div>`).join("")}<div class="bubble now"><small>soru</small>${esc(question.text)}</div></div>
    <div class="three-columns">${columns}</div>${story}
    <p class="overall">Her sütunda: aranan metin, doğru pasajın Jev'den sonraki sırası ve ilk 3. "İmplant yaptıracağım. → Ne kadar tutuyor?" sohbetini de seç.</p>`;
  const select = $("#chat-select");
  select.onchange = () => { chatToy.question = select.value; renderChatToy(); };
}

function renderChatGain() {
  const kind = (key) => LAB.metrics[key].all.byKind.followup["recall@1"].toFixed(2);
  $("#chat-gain").innerHTML = `<b>Kazanç.</b> Sohbetin devamı olan 15 soruda, Jev ile ${term("recall1")}: son mesajla ${kind("jev/last")}, geçmiş ekli <b>${kind("jev/history")}</b>, Luna'nın yazdığıyla ${kind("jev/rewrite")}. Rerank'siz hibrit aramada da aynı sıra: ${kind("rrf/last")}, ${kind("rrf/history")}, ${kind("rrf/rewrite")}. En basit yol kazandı. Bütün 52 soruda ${term("ndcg")} artık ${LAB.metrics["jev/history"].all.summary["nDCG@10"].toFixed(2)}: bu soru setinde ulaşılabilecek en yüksek nokta.`;
}

function renderFinalReport() {
  const rows = [
    ["bm25-naive/last", "BM25", "2", "< 1 ms", "ücretsiz", "hayır"],
    ["bm25-f5/last", "+ Türkçe kelimeler", "4", "< 1 ms", "ücretsiz", "hayır"],
    ["e5/last", "Anlamla arama (e5)", "5", "~9 ms", "ücretsiz (yerel)", "hayır"],
    ["rrf/last", "Hibrit (RRF)", "6", "~10 ms", "ücretsiz", "hayır"],
    ["jev/last", "+ Rerank (Jev)", "7", "+ 0.4 sn", "~$0.0004 / soru", "evet"],
    ["jev/history", "+ Sohbet (geçmiş ekli)", "8", "+ 0", "ücretsiz", "evet"],
  ];
  $("#final-report").innerHTML = `<div class="table-scroll"><table class="report"><thead><tr><th>aşama</th><th>bölüm</th><th>${term("recall1")}</th><th>${term("recall5")}</th><th>${term("ndcg")}</th><th>süre</th><th>maliyet</th><th>metin dışarı</th></tr></thead>
    <tbody>${rows.map(([key, label, chapter, time, cost, out]) => { const summary = LAB.metrics[key].all.summary; return `<tr><td><b>${esc(label)}</b></td><td class="num"><a href="#b${chapter}">${chapter}</a></td><td class="num">${summary["recall@1"].toFixed(2)}</td><td class="num">${summary["recall@5"].toFixed(2)}</td><td class="num">${summary["nDCG@10"].toFixed(2)}</td><td class="num">${esc(time)}</td><td>${esc(cost)}</td><td>${esc(out)}</td></tr>`; }).join("")}</tbody></table></div>
    <p class="overall">52 sorunun hepsinde (cevaplı 47'si üzerinden), sohbet soruları son satıra kadar önceki mesaj olmadan. Süreler bu sayfadaki küçük klinik için, laboratuvarın ölçümleri.</p>`;
}

renderRagLine();
renderExamples();
renderMap();
renderChunkToy();
renderQueryBar();
renderBm();
renderTries();
renderRankToy();
renderReport();
renderTokenToy();
renderPairToy();
renderF5();
renderCosineToy();
renderMeaningToy();
renderE5();
renderFusionProblem();
renderFusionToy();
renderAlphaToy();
renderRrf();
renderRerankToy();
renderThresholdToy();
renderRerankerTable();
renderJev();
renderChatToy();
renderChatGain();
renderFinalReport();
