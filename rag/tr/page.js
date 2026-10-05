"use strict";
const LAB = window.LAB;
const { tokenizers, BM25, rrf, weighted, check } = window.LabBM25;
const { recallAt, reciprocal, dcg, ndcgAt, gainsOf, checkMetrics } = window.LabMetrics;

const passages = new Map(LAB.passages.map((passage) => [passage.id, passage]));
const questions = new Map(LAB.questions.map((question) => [question.id, question]));
const stages = LAB.stages;
const stageOf = Object.fromEntries(stages.map((stage, index) => [stage.id, { ...stage, index }]));
const COLOR = { "bm25-naive": "var(--naive)", "bm25-f5": "var(--f5)", e5: "var(--e5)", rrf: "var(--rrf)", jev: "var(--jev)", history: "var(--history)" };
const HEX = { "bm25-naive": "#8b95a7", "bm25-f5": "#d97706", e5: "#8b5cf6", rrf: "#0f9f8f", jev: "#2f5bea", history: "#e0457b" };
const indexes = { naive: new BM25(LAB.passages, tokenizers.naive), f5: new BM25(LAB.passages, tokenizers.f5) };

const KINDS = {
  exact: ["Aynı kelimeler", "Sorunun kelimeleri pasajda aynen geçiyor. En kolayı; yine de 'İmplant' gibi büyük harfler sorun çıkarıyor."],
  morphology: ["Başka ek", "Aynı kelime, başka bir Türkçe ekle: 'otoparkınız' ile 'otopark'. Kelime araması için ayrı kelimeler."],
  paraphrase: ["Başka kelimeler", "Aynı anlam, ortak kelime yok: 'arabamı nereye bırakırım' ile 'otopark'. Kelime araması burada kör."],
  multi: ["İki pasaj", "Cevap iki ayrı pasajda ve ikisi de gerekiyor: fiyat bir yerde, sigorta başka yerde."],
  followup: ["Sohbetin devamı", "Önceki mesaj olmadan eksik: 'Ne kadar sürüyor?' Neyin? {{history|Geçmişi}} açınca ne değiştiğine bak."],
  statement: ["Soru değil", "Bir cümle, ama bir pasaj gerektiriyor: 'Yarın dolgu yaptıracağım.' iyi bir asistan tedavi sonrası notu bulur."],
  none: ["Cevabı yok", "Belgelerde cevabı yok. İyi bir arama burada 'bilmiyorum' demeli; ama arama her zaman bir şey getirir."],
};

const GLOSSARY = {
  rag: { group: "Temel", label: "RAG", title: "RAG ve retrieval", text: "RAG (retrieval-augmented generation): soru gelince belgelerde ilgili parçaları bulup (retrieval), soruyla birlikte modele vermek (augmented) ve modelin onlara dayanarak cevap üretmesi (generation). Retrieval, bulma adımı: bu sayfanın büyük kısmı (Bölüm 1-8). Generation, Bölüm 9." },
  chunking: { group: "Temel", label: "chunking", title: "Chunking (parçalama)", text: "Belgeleri önceden aranabilir parçalara (pasaj, chunk) bölmek: başlıklara göre, sabit sayıda kelimeyle ya da cümle cümle. Nereden kestiğin, aramanın neyi bulabileceğini belirler (Bölüm 1)." },
  pasaj: { group: "Temel", label: "pasaj", title: "Pasaj (chunk)", text: "Belgenin aranabilir bir parçası. Burada her başlığın altı bir pasaj: 12 belgeden 55 pasaj. Arama belge değil pasaj döndürür, çünkü modele bütün belgeyi değil, cevabın geçtiği parçayı vermek istiyoruz." },
  index: { group: "Temel", label: "indeks", title: "İndeks (inverted index)", text: "Aramayı hızlı yapmak için önceden kurulan tablo. Kelime aramasında her kelimenin hangi pasajlarda kaç kez geçtiğini tutar (kitabın sonundaki dizin gibi); anlam aramasında her pasajın vektörünü. Soru gelince bütün metni okumak yerine bu tabloya bakılır." },
  target: { group: "Temel", label: "doğru pasaj", title: "Doğru pasaj (hedef)", text: "Sorunun cevabını içeren pasaj. Her soru için belgeden bir cümle seçtik (örneğin \"Kompozit dolgu: 1.500 TL\"); o cümleyi içeren pasaj doğru sayılır. Bunu sadece ölçüm bilir, arama bilmez: arama sadece soruyu ve belgeleri görür." },
  history: { group: "Temel", label: "geçmiş", title: "Geçmiş", text: "Sohbetteki önceki mesajlar. \"Ne kadar sürüyor?\" tek başına aranınca neyin süresi olduğu belli değil. Önceki mesajı (\"Dolgu yaptırmak istiyorum.\") sorgunun önüne eklemek yetiyor (Ders 8a)." },
  recall1: { group: "Ölçüler", label: "recall@1", title: "recall@1", text: "Doğru pasaj birinci sırada mı? Evet 1, hayır 0; sonra bütün soruların ortalaması. 0.338: soruların üçte birinde doğru pasaj en üstteydi. Cevap iki pasajdaysa ve biri birinci sıradaysa 0.5." },
  recall5: { group: "Ölçüler", label: "recall@5", title: "recall@5", text: "Doğru pasaj ilk 5'te mi? Modele genelde ilk birkaç pasaj verilir; doğru pasaj ilk 5'teyse model cevabı görebilir. Sırası önemsiz: 1. de 5. de aynı puan." },
  ndcg: { group: "Ölçüler", label: "nDCG@10", title: "nDCG@10", text: "Sıralamanın kalitesi, 0 ile 1 arası. İlk 10 sonuca bakar ve doğru pasajı ne kadar üstteyse o kadar ödüllendirir: 1. sırada 1 puan, 2. sırada 0.63, 3. sırada 0.5, 10. sırada 0.29, ilk 10'da yoksa 0 (puan = 1 / log₂(sıra + 1)). En iyi mümkün sıralamaya bölündüğü için 1 = mükemmel. recall@1 \"birinci mi, değil mi\" der; nDCG \"ikinci olmak, onuncu olmaktan çok daha iyi\" der." },
  tokenize: { group: "Kelime araması", label: "kelimelere ayırma", title: "Kelimelere ayırma (tokenizer)", text: "Metni indeksin saklayacağı kelimelere bölmek. Soru ve pasaj aynı şekilde bölünür, yoksa eşleşmez. Ders 1'de str.lower() ile: \"İmplant\" bozulup \"i\" ve \"mplant\" oluyor. Ders 4a'da Türkçe harfler ve ilk 5 harf." },
  f5: { group: "Kelime araması", label: "ilk 5 harf", title: "İlk 5 harf (F5)", text: "Her kelimeyi ilk 5 harfine kesmek: \"otoparkınız\" ve \"otopark\" ikisi de \"otopa\" olur, ekler gider. Kaba ama Türkçede şaşırtıcı iyi çalışıyor (Can ve arkadaşları, 2008). Bedeli: \"ücreti\" ile \"ücretsiz\" de aynı oluyor." },
  stemming: { group: "Kelime araması", label: "stemming", title: "Stemming (kök bulma)", text: "Kelimenin eklerini atıp köküne indirmek: \"otoparkınız\" → \"otopark\". Dilbilgisi kurallarıyla (Snowball) ya da kaba bir kuralla (ilk 5 harf) yapılır. Amaç, aynı kelimenin farklı hallerini aramada buluşturmak (Bölüm 4)." },
  bm25: { group: "Kelime araması", label: "BM25", title: "BM25", text: "Kelime eşleşmesiyle puanlayan klasik formül (1994'ten beri, Elasticsearch'ün de varsayılanı). Sorudaki her kelime için üç şeye bakar: pasajda geçiyor mu, kaç kez geçiyor, ve kelime ne kadar nadir. Nadir kelime (\"otopark\") çok puan getirir, her yerde geçen kelime (\"ne\") az. Kısa pasajda geçmek, uzun pasajda geçmekten değerli." },
  "bm25-score": { group: "Kelime araması", label: "BM25 puanı", title: "BM25 puanı", text: "Sorunun her kelimesinin bu pasaja getirdiği payların toplamı (sonuç kartlarındaki +5.57 gibi sayılar). Bir üst sınırı yok ve sorudan soruya değişiyor: sadece aynı sorunun pasajları arasında karşılaştırılır." },
  df: { group: "Kelime araması", label: "kaç pasajda geçtiği", title: "Kaç pasajda geçtiği (df) ve nadirlik (IDF)", text: "Kelimelerin üstündeki küçük sayı: o kelime 55 pasajın kaçında geçiyor. Az pasajda geçen kelime ayırt edicidir; BM25 ona IDF ile büyük ağırlık verir. Üstü çizili kelime hiçbir pasajda yok: BM25 için o kelime hiç sorulmamış gibi." },
  embedding: { group: "Anlam araması", label: "embedding", title: "Embedding", text: "Bir metnin anlamını temsil eden sayı dizisi (vektör). Anlamca yakın metinlerin sayıları da yakın olur, ortak kelimeleri olmasa bile: \"arabamı nereye bırakırım\" ile otopark pasajı. Pasajların vektörleri önceden hesaplanır; soru gelince sadece sorunun vektörü hesaplanır ve en yakın pasajlar bulunur." },
  e5: { group: "Anlam araması", label: "e5", title: "e5-small", text: "intfloat/multilingual-e5-small: çok dilli, küçük, ücretsiz bir embedding modeli; her metni 384 sayıya çevirir. Bilgisayarda çalışır (soru başına 9 ms), metin dışarı gitmez. Klinikte OpenAI'ın embedding'inden iyi çıktı." },
  cosine: { group: "Anlam araması", label: "cosine", title: "Cosine benzerliği", text: "İki vektörün ne kadar aynı yöne baktığı: 1 aynı yön (aynı anlam), 0 alakasız. e5'in puanları dar bir aralıkta toplanıyor (0.80-0.90): önemli olan sıralama, sayının kendisi değil." },
  pca: { group: "Anlam araması", label: "PCA", title: "PCA (temel bileşen analizi)", text: "Çok boyutlu noktaları, en çok yayıldıkları birkaç yöne yansıtıp az boyutta göstermek. Bir binanın gölgesini yere düşürmek gibi: bazı bilgiler kaybolur ama birbirine yakın olan şeyler çoğunlukla yakın kalır. Burada 384 boyutu 2'ye indiriyoruz; harita kaba bir gölge, aramanın kendisi 384 boyutta yapılır." },
  hybrid: { group: "Birleştirme ve sıralama", label: "hibrit", title: "Hibrit arama", text: "Kelime aramasını (BM25) ve anlam aramasını (embedding) birlikte çalıştırıp listelerini birleştirmek. Biri sayıları, isimleri ve tam terimleri yakalar, öbürü anlamı; biri kaçırınca öbürü bulur (Ders 6)." },
  rrf: { group: "Birleştirme ve sıralama", label: "RRF", title: "RRF (Reciprocal Rank Fusion)", text: "İki sıralı listeyi puanlara değil sıralara bakarak birleştirmek. Her pasaj, girdiği her listeden 1/(60 + sıra) puan alır: BM25'te 1. ve e5'te 3. olan pasaj 1/61 + 1/63 = 0.0323. İki listede de üstte olan kazanır. BM25 puanı ile cosine farklı ölçeklerde olduğu için puanları toplamak işe yaramaz; sıralar ise karşılaştırılabilir." },
  rerank: { group: "Birleştirme ve sıralama", label: "rerank", title: "Rerank (yeniden sıralama)", text: "İlk aramanın getirdiği ilk 20 pasajı daha akıllı ama yavaş bir modelle yeniden sıralamak. İlk arama soruyu ve pasajı ayrı ayrı görür; reranker ikisini birlikte okur ve \"bu pasaj bu soruyu cevaplıyor mu?\" diye bakar. Sadece ilk 20'ye uygulanır, çünkü 55 pasajın hepsini okumak yavaş ve pahalı." },
  "cross-encoder": { group: "Birleştirme ve sıralama", label: "cross-encoder", title: "Cross-encoder ve bi-encoder", text: "Bi-encoder (embedding modeli) soruyu ve pasajı ayrı ayrı vektöre çevirir: pasajlar önceden hesaplanır, arama hızlıdır ama ikisi hiç birlikte okunmaz. Cross-encoder soruyu ve pasajı birlikte okuyup tek bir puan verir: çok daha doğru ama her soru-pasaj çifti için ayrı bir hesap, bu yüzden sadece ilk 20 adaya uygulanır (Bölüm 7)." },
  rewriting: { group: "Birleştirme ve sıralama", label: "query rewriting", title: "Query rewriting (sorguyu yeniden yazmak)", text: "Aramadan önce sorguyu değiştirmek: sohbetteki eksik bir mesajı (\"Ne kadar sürüyor?\") tek başına anlaşılır bir soruya çevirmek. Bir dil modeliyle yapılabilir; en basit hali önceki mesajı sorgunun önüne eklemek (Bölüm 8)." },
  jev: { group: "Birleştirme ve sıralama", label: "Jev", title: "Jev ve Jev olasılığı", text: "TypeSafe'in evet/hayır kararları için eğitilmiş bir modeli (typesafe/jev-1.13, OpenRouter üzerinden). Her pasaj için \"bu pasaj soruyu cevaplıyor mu?\" sorusuna 0 ile 1 arası bir olasılık döner; sıralama bu olasılıkla yapılır. Ders 7'de Luna kadar iyi, 20 kat hızlı ve ~3 kat ucuz çıktı. Olasılık düşükse (0.69'un altı) cevap belgelerde yok demektir." },
  generation: { group: "Cevap", label: "generation", title: "Generation (cevap üretme)", text: "RAG'ın son adımı: bulunan pasajları soruyla birlikte bir dil modeline verip cevabı ona yazdırmak. Model ancak önüne konanı bilir; iyi bir cevap için pasajın doğru gelmesi gerekir ama yetmez (Bölüm 9)." },
  prompt: { group: "Cevap", label: "prompt", title: "Prompt", text: "Modele bir seferde giden metnin tamamı: talimat, numaralı pasajlar, varsa önceki mesajlar ve müşterinin mesajı. Model sadece bunu görür; konuşmanın geri kalanını hatırlamaz." },
  instructions: { group: "Cevap", label: "talimat", title: "Talimat (instructions, system prompt)", text: "Modele nasıl davranacağını söyleyen kısım. \"Sadece pasajlardan cevapla, fiyat uydurma, yoksa bilmiyorum de\" gibi birkaç cümle, laboratuvarda uydurmayı sıfıra indirdi." },
  citation: { group: "Cevap", label: "kaynak", title: "Kaynak (citation)", text: "Modelin cevabında dayandığı pasajların numaraları. Numara olduğu için hakemsiz kontrol edilebilir: gösterilen pasajda sorunun cevabı gerçekten var mı?" },
  known: { group: "Cevap", label: "known", title: "\"Belgelerde var mıydı?\" (known)", text: "Modelin cevapla birlikte işaretlediği evet/hayır alanı: pasajlarda cevap var mıydı? \"Bilmiyorum\"u metinden tahmin etmek yerine ayrı bir alan. Laboratuvarda kısmi cevaplarda tutarsız çıktı: model \"belirtilmemiş\" yazıp \"var\" işaretleyebiliyor." },
  hallucination: { group: "Cevap", label: "uydurma", title: "Uydurma (hallucination)", text: "Modelin, önündeki pasajlarda olmayan bir şeyi gerçekmiş gibi söylemesi: belgede yazmayan bir kron fiyatı, \"sigara içebilirsiniz\" gibi bir tavsiye. Çoğu kötü niyetli değil, yardımcı olmaya çalışırken belgenin ötesine geçmek." },
  judge: { group: "Cevap", label: "hakem", title: "Hakem (LLM-as-judge)", text: "Bir cevabı başka bir modele notlatmak. Serbest metin, doğru cevapla harf harf karşılaştırılamaz; \"7.500 TL\" ile \"yedi bin beş yüz lira\" aynı cevap. Hakem de yanılabilir, bu yüzden önce notu bilinen cevaplarla sınanır." },
  faithfulness: { group: "Cevap", label: "sadakat", title: "Sadakat (faithfulness, groundedness)", text: "Cevabın söylediği her şeyin önündeki pasajlarda bulunması. Doğruluktan ayrı: \"Size yardımcı olmaktan memnuniyet duyarım\" hiçbir şey uydurmadığı için sadıktır ama soruyu cevaplamadığı için yanlıştır." },
  claim: { group: "Cevap", label: "iddia", title: "İddia (claim)", text: "Cevabın tek başına doğru ya da yanlış olabilecek en küçük parçası: \"Kanal tedavisi 4.500 TL.\", \"Kron 3.000 TL civarında.\" Sadakat iddia iddia sorulur; tek bir \"cevap pasajlara dayanıyor mu?\" sorusu, dört doğru cümlenin arasındaki tek uydurmayı kaçırabilir." },
  m0: { group: "Cevap", label: "hepsi prompta", title: "Hepsi prompta (M0, long context)", text: "Hiç aramadan bilgi tabanının tamamını her soruda modele vermek. Bu klinikte (55 pasaj, ~3.400 token) aramayla aynı kaliteyi verdi, cevap başına 5 kat pahalıya. Bilgi tabanı büyüdükçe hem sığmaz hem pahalılaşır." },
  agent: { group: "Cevap", label: "agent", title: "Agent ve agentic RAG", text: "Bir dil modelinin tek bir cevap yazmak yerine adım adım karar verdiği düzen: bir tool çağırır, sonucunu görür, yeniden karar verir. Agentic RAG'da tool arama: model aranıp aranmayacağına, ne aranacağına ve ne zaman duracağına kendisi karar verir (Bölüm 10)." },
  tool: { group: "Cevap", label: "tool", title: "Tool (tool calling)", text: "Modelin kullanabileceği bir fonksiyon: adı, açıklaması ve alacağı parametreler. Model metin yazmak yerine \"search_knowledge('otopark') çağır\" diye bir istek döner; çağrıyı biz yaparız ve sonucu ona geri veririz. Model fonksiyonu kendisi çalıştırmaz." },
  expansion: { group: "Cevap", label: "sorgu genişletme", title: "Sorgu genişletme (query expansion)", text: "Sorguya, aranan şeyin başka adlarını eklemek: \"Dişlerimi daha beyaz yaptırmak kaça mal olur?\" yerine \"diş beyazlatma fiyatı ücreti maliyet\". Kelime araması eş anlamlılara ve eklere kör olduğu için, doğru kelime sorguda yoksa pasaj bulunamaz. Agent bunu kendiliğinden yaptı (Bölüm 10)." },
  luna: { group: "Birleştirme ve sıralama", label: "Luna", title: "Luna", text: "gpt-6-luna: OpenAI'ın küçük ve ucuz modeli. Bölüm 9'da cevapları yazıyor ve cevapları iddialara bölüyor. Ders 8a'da sohbeti tek başına anlaşılır bir sorguya yeniden yazdı (\"Ne kadar tutuyor?\" → \"Diş implantı ne kadar tutuyor?\"). Geçmişi olduğu gibi eklemekten kötü çıktı: \"tutmak\"ı \"dayanmak\" anlamına kaydırdı." },
};
const SCORE_TERM = { "bm25-naive": "bm25-score", "bm25-f5": "bm25-score", e5: "cosine", rrf: "rrf", jev: "jev" };

const esc = (text) => String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
// {{key}} or {{key|shown words}} becomes a term with its glossary entry.
const TERM = /\{\{([\w-]+)(?:\|([^}]+))?\}\}/g;
const rich = (text) => esc(text).replace(TERM, (_, key, shown) => term(key, shown));
const term = (key, shown) => `<span class="term" tabindex="0" data-term="${key}">${shown || esc(GLOSSARY[key].label)}</span>`;
const fixed = (value, digits = 3) => (value == null ? "-" : value.toFixed(digits));
const $ = (selector) => document.querySelector(selector);

function renderGlossary() {
  const groups = [...new Set(Object.values(GLOSSARY).map((entry) => entry.group))];
  $("#glossary").innerHTML = groups.map((group) => `<div class="group">${esc(group)}</div>` + Object.values(GLOSSARY)
    .filter((entry) => entry.group === group)
    .map((entry) => `<div class="card"><h3>${esc(entry.title)}</h3><p>${esc(entry.text)}</p></div>`).join("")).join("");
}

const pop = { element: null, hide: null };

function showTerm(element) {
  const entry = GLOSSARY[element.dataset.term];
  if (!entry) return;
  clearTimeout(pop.hide);
  const box = $("#pop");
  box.innerHTML = `<b>${esc(entry.title)}</b>${esc(entry.text)}`;
  box.classList.add("on");
  const rect = element.getBoundingClientRect();
  const width = box.offsetWidth;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), document.documentElement.clientWidth - width - 8);
  const below = rect.bottom + 8 + box.offsetHeight < window.innerHeight;
  box.style.left = `${left + window.scrollX}px`;
  box.style.top = `${(below ? rect.bottom + 8 : rect.top - 8 - box.offsetHeight) + window.scrollY}px`;
  pop.element = element;
}

function hideTerm() {
  pop.hide = setTimeout(() => { $("#pop").classList.remove("on"); pop.element = null; }, 120);
}

document.addEventListener("mouseover", (event) => { const element = event.target.closest(".term"); if (element) showTerm(element); });
document.addEventListener("mouseout", (event) => { if (event.target.closest(".term")) hideTerm(); });
document.addEventListener("focusin", (event) => { const element = event.target.closest(".term"); if (element) showTerm(element); });
document.addEventListener("focusout", (event) => { if (event.target.closest(".term")) hideTerm(); });
document.addEventListener("click", (event) => {
  const element = event.target.closest(".term");
  if (element) { event.stopPropagation(); return pop.element === element ? hideTerm() : showTerm(element); }
  if (pop.element) hideTerm();
}, true);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") hideTerm(); });

function rankIn(rows, ids) {
  const index = rows.findIndex((row) => ids.includes(row[0]));
  return index < 0 ? null : index + 1;
}

function tokenChips(text, index) {
  return index.tokenize(text).map((word) => {
    const df = index.documentFrequency(word);
    return `<span class="token ${df ? "" : "missing"}" title="${df ? `${df} pasajda geçiyor` : "indekste yok: hiçbir pasajda bu kelime yok"}">${esc(word)}${df ? `<sup>${df}</sup>` : ""}</span>`;
  }).join("");
}

function queryOf(question, mode) {
  return mode === "last" ? question.text : LAB.queries[question.id][mode];
}

function rankWords(rank) {
  return rank ? `${rank}. sırada` : "ilk 20'de yok";
}

function highlighted(body, quotes) {
  const ranges = [];
  for (const quote of quotes) {
    const pattern = quote.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
    const match = new RegExp(pattern).exec(body);
    if (match) ranges.push([match.index, match.index + match[0].length]);
  }
  ranges.sort((one, other) => one[0] - other[0]);
  let html = "", at = 0;
  for (const [start, end] of ranges) {
    if (start < at) continue;
    html += esc(body.slice(at, start)) + `<mark>${esc(body.slice(start, end))}</mark>`;
    at = end;
  }
  return html + esc(body.slice(at));
}

const CHAPTERS = [
  { id: "b0", number: "0", title: "Sorun: doğru cümleyi bulmak", ready: true, terms: [["RAG", "rag"], ["retrieval", "rag"]] },
  { id: "b1", number: "1", title: "Belgeyi parçalara bölmek", ready: true, terms: [["chunking", "chunking"]] },
  { id: "b2", number: "2", title: "Kelimeyle aramak", ready: true, terms: [["BM25", "bm25"], ["inverted index", "index"]] },
  { id: "b3", number: "3", title: "Nasıl ölçeriz", ready: true, terms: [["evaluation"], ["recall@k", "recall5"], ["nDCG", "ndcg"]], teaser: "Bir düzeltmenin gerçekten işe yaradığını 52 soruyla ölçmek: recall, MRR, nDCG." },
  { id: "b4", number: "4", title: "Türkçe kelimeler", ready: true, terms: [["tokenization", "tokenize"], ["stemming", "stemming"]], teaser: "\"Gecikirsem\" ile \"gecikmelerde\"yi buluşturmak: Türkçe harfler ve kelimenin ilk 5 harfi." },
  { id: "b5", number: "5", title: "Anlamla arama", ready: true, terms: [["embedding", "embedding"], ["vector search", "embedding"]], teaser: "Ortak kelime yokken bulmak: \"arabamı nereye bırakırım\" ve otopark. Embedding." },
  { id: "b6", number: "6", title: "İkisini birleştirmek", ready: true, terms: [["hybrid search", "hybrid"], ["RRF", "rrf"]], teaser: "Kelime ve anlam aramasının listelerini tek listeye çevirmek: RRF." },
  { id: "b7", number: "7", title: "Yeniden sıralamak", ready: true, terms: [["reranking", "rerank"], ["cross-encoder", "cross-encoder"]], teaser: "İlk 20'yi bir modele okutup en iyisini başa almak, ve \"bilmiyorum\" diyebilmek." },
  { id: "b8", number: "8", title: "Sohbet", ready: true, terms: [["query rewriting", "rewriting"]], teaser: "\"Ne kadar sürüyor?\" Neyin? Önceki mesajı hesaba katmak." },
  { id: "b9", number: "9", title: "Cevap yazmak", ready: true, terms: [["generation", "generation"], ["hallucination", "hallucination"], ["LLM-as-judge", "judge"], ["faithfulness", "faithfulness"]], teaser: "Bulunan pasajlarla cevap yazdırmak, uydurmayı engellemek ve cevabı bir hakemle ölçmek." },
  { id: "b10", number: "10", title: "Aramayı modele bırakmak", ready: true, terms: [["agentic RAG", "agent"], ["tool calling", "tool"], ["query expansion", "expansion"]], teaser: "Arama bir tool olur; ne zaman, ne arayacağına model karar verir." },
  { id: "b11", number: "11", title: "Hepsi bir arada", ready: true, terms: [["RAG pipeline"]] },
  { id: "terimler", number: "?", title: "Terimler", ready: true },
];

function termTags(chapter) {
  return (chapter.terms || []).map(([label, key]) => `<span class="tag">${key ? term(key, esc(label)) : esc(label)}</span>`).join("");
}

function renderChapterTerms() {
  for (const chapter of CHAPTERS) {
    const heading = document.querySelector(`#${chapter.id} > header h2`);
    if (heading && chapter.terms) heading.insertAdjacentHTML("afterend", `<div class="tags">${termTags(chapter)}</div>`);
  }
}

function renderToc() {
  $("#toc").innerHTML = `<div class="toc-title">Bölümler</div>` + CHAPTERS.map((chapter) => `
    <a href="#${chapter.id}" data-for="${chapter.id}" class="${chapter.ready ? "" : "later"}"><span class="num">${chapter.number}</span><span>${esc(chapter.title)}${chapter.terms ? `<small class="toc-terms">${esc(chapter.terms.map(([label]) => label).join(" · "))}</small>` : ""}</span>${chapter.ready ? "" : " <small>yakında</small>"}</a>`).join("");
  const links = [...document.querySelectorAll("#toc a")];
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) for (const link of links) link.classList.toggle("on", link.dataset.for === entry.target.id);
    }
  }, { rootMargin: "-25% 0px -65% 0px" });
  for (const section of document.querySelectorAll("section.chapter")) observer.observe(section);
}

for (const element of document.querySelectorAll("[data-rich]")) element.innerHTML = element.innerHTML.replace(TERM, (_, key, shown) => term(key, shown));
renderGlossary();
renderToc();
renderChapterTerms();

const problems = [...check(LAB), ...checkMetrics(LAB)];
const searched = Object.values(LAB.bm25).reduce((sum, expected) => sum + Object.keys(expected.questions).length + Object.keys(expected.queries || {}).length, 0);
$("#check").className = `check ${problems.length ? "bad" : "ok"}`;
$("#check").textContent = problems.length
  ? `Uyarı: tarayıcıdaki BM25 Python'unkinden ${problems.length} yerde ayrılıyor (${problems[0]}).`
  : `✓ Tarayıcıdaki BM25 ve ölçüler, laboratuvarın Python kodundakilerle aynı sonucu veriyor (${searched} arama, ${Object.keys(LAB.results).length} aramanın ortalamaları).`;
$("#generated").textContent = `Veri: site/export.py, ${LAB.generated}.`;
