// lab/text.py, lab/search/bm25.py and lab/search/hybrid.py in JavaScript; check() compares them with Python's results in data.js.
(function (root) {
  // Python's \w: letters, numbers and "_", but no combining marks (so "İ".lower()'s dot splits a word).
  const WORD = /[\p{L}\p{N}_]+/gu;
  const TURKISH_WORD = /\p{Nd}+(?:[.,:]\p{Nd}+)*|[\p{L}\p{N}_]+/gu;
  const STARTS_WITH_DIGIT = /^\p{Nd}/u;

  function naive(text) {
    return text.toLowerCase().match(WORD) || [];
  }

  function lowerTurkish(text) {
    return text.replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
  }

  function turkish(text) {
    return lowerTurkish(text).match(TURKISH_WORD) || [];
  }

  function f5(text) {
    return turkish(text).map((word) => (STARTS_WITH_DIGIT.test(word) ? word : Array.from(word).slice(0, 5).join("")));
  }

  function trigram(text) {
    return turkish(text).flatMap((word) => {
      if (STARTS_WITH_DIGIT.test(word)) return [word];
      const marked = Array.from(`#${word}#`);
      return marked.slice(0, -2).map((_, start) => marked.slice(start, start + 3).join(""));
    });
  }

  const tokenizers = { naive, turkce: turkish, f5, trigram };

  // lab/text.py's English tokenizers. Stems come from Python (words.stems in data-en.js); a word the
  // page has never seen keeps its own form, which the free search box says.
  function englishTokenizers(words) {
    const stop = new Set(words.stopWords);
    const english = (text) => text.toLowerCase().match(TURKISH_WORD) || [];
    const stem = (word) => (STARTS_WITH_DIGIT.test(word) ? word : words.stems[word] || word);
    return {
      naive,
      english,
      snowball: (text) => english(text).map(stem),
      stopped: (text) => english(text).filter((word) => !stop.has(word)).map(stem),
      known: (word) => STARTS_WITH_DIGIT.test(word) || word in words.stems,
    };
  }

  class BM25 {
    constructor(passages, tokenize, k1 = 1.2, b = 0.75) {
      this.passages = passages;
      this.tokenize = tokenize;
      this.k1 = k1;
      this.b = b;
      this.postings = new Map(); // word -> Map(passage number -> times it occurs)
      this.lengths = [];
      passages.forEach((passage, number) => {
        const words = tokenize(passage.text);
        this.lengths.push(words.length);
        const counts = new Map();
        for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
        for (const [word, count] of counts) {
          if (!this.postings.has(word)) this.postings.set(word, new Map());
          this.postings.get(word).set(number, count);
        }
      });
      this.averageLength = this.lengths.reduce((sum, length) => sum + length, 0) / this.lengths.length;
    }

    documentFrequency(word) {
      return this.postings.has(word) ? this.postings.get(word).size : 0;
    }

    idf(word) {
      const n = this.passages.length;
      const df = this.documentFrequency(word);
      return Math.log(1 + (n - df + 0.5) / (df + 0.5));
    }

    tf(count, length) {
      const evened = 1 - this.b + (this.b * length) / this.averageLength;
      return (count * (this.k1 + 1)) / (count + this.k1 * evened);
    }

    search(query, k = 5) {
      const why = new Map();
      for (const word of new Set(this.tokenize(query))) {
        const idf = this.idf(word);
        for (const [number, count] of this.postings.get(word) || []) {
          if (!why.has(number)) why.set(number, new Map());
          why.get(number).set(word, idf * this.tf(count, this.lengths[number]));
        }
      }
      const total = (number) => [...why.get(number).values()].reduce((sum, share) => sum + share, 0);
      return [...why.keys()]
        .map((number) => ({ number, score: total(number) }))
        .sort((one, other) => other.score - one.score || one.number - other.number)
        .slice(0, k)
        .map(({ number, score }) => ({ passage: this.passages[number], score, why: Object.fromEntries(why.get(number)) }));
    }
  }

  // lab/search/hybrid.py: lists of [passage, score], best first. Ties go to the smaller passage id, as in Python.
  const byScore = (scores) => [...scores.keys()].sort((one, other) => scores.get(other) - scores.get(one) || (one < other ? -1 : 1));

  function rrf(lists, k = 60) {
    const scores = new Map();
    for (const list of lists) list.forEach(([passage], index) => scores.set(passage, (scores.get(passage) || 0) + 1 / (k + index + 1)));
    return byScore(scores).map((passage) => [passage, scores.get(passage)]);
  }

  function stretched(list) {
    if (!list.length) return new Map();
    const values = list.map(([, score]) => score);
    const [low, high] = [Math.min(...values), Math.max(...values)];
    return new Map(list.map(([passage, score]) => [passage, high > low ? (score - low) / (high - low) : 1]));
  }

  function weighted(lexical, vector, alpha) {
    const [words, meaning] = [stretched(lexical), stretched(vector)];
    const scores = new Map();
    for (const passage of new Set([...words.keys(), ...meaning.keys()])) scores.set(passage, alpha * (words.get(passage) || 0) + (1 - alpha) * (meaning.get(passage) || 0));
    return byScore(scores).map((passage) => [passage, scores.get(passage)]);
  }

  function pick(words, side) {
    return Object.fromEntries(Object.entries(words).map(([name, both]) => [name, both[side]]));
  }

  function same(one, other) {
    return JSON.stringify(one) === JSON.stringify(other);
  }

  // Every way the JavaScript copy disagrees with Python; empty when it doesn't.
  function check(lab) {
    const problems = [];
    const text = Object.fromEntries(lab.questions.map((question) => [question.id, question.text]));
    for (const [sample, expected] of [...Object.entries(lab.tokenizers.samples), ...lab.tokenizers.pairs.flatMap((pair) => [[pair.question, pick(pair.words, 0)], [pair.passage, pick(pair.words, 1)]])]) {
      for (const [name, words] of Object.entries(expected)) {
        if (tokenizers[name] && !same(tokenizers[name](sample), words)) problems.push(`${name}: "${sample}" → ${JSON.stringify(tokenizers[name](sample))}, Python: ${JSON.stringify(words)}`);
      }
    }
    for (const [name, expected] of Object.entries(lab.bm25)) {
      const tokenize = tokenizers[name];
      for (const [sample, words] of Object.entries(expected.samples)) {
        if (!same(tokenize(sample), words)) problems.push(`${name}: "${sample}" → ${JSON.stringify(tokenize(sample))}, Python: ${JSON.stringify(words)}`);
      }
      const index = new BM25(lab.passages, tokenize);
      for (const [id, { tokens, top }] of Object.entries(expected.questions)) {
        if (!same(tokenize(text[id]), tokens)) problems.push(`${name}: ${id}'in kelimeleri farklı`);
        const found = index.search(text[id], 5);
        const agrees = found.length === top.length && found.every((hit, rank) => hit.passage.id === top[rank][0] && Math.abs(hit.score - top[rank][1]) < 1e-3);
        if (!agrees) problems.push(`${name}: ${id}'in ilk 5'i farklı`);
      }
      for (const [query, top] of Object.entries(expected.queries || {})) {
        const found = index.search(query, 5);
        const agrees = found.length === top.length && found.every((hit, rank) => hit.passage.id === top[rank][0] && Math.abs(hit.score - top[rank][1]) < 1e-3);
        if (!agrees) problems.push(`${name}: "${query}" sorgusunun ilk 5'i farklı`);
      }
    }
    for (const question of lab.questions) {
      const fused = rrf([lab.lists["bm25-f5"][question.id], lab.lists.e5[question.id]]).slice(0, 20).map(([passage]) => passage);
      if (!same(fused, lab.results["rrf/last"][question.id].map(([passage]) => passage))) problems.push(`rrf: ${question.id}'in sıralaması farklı`);
    }
    return problems;
  }

  // Every way the English page's tokenizers and BM25 disagree with Python's; empty when they don't.
  function checkEnglish(lab) {
    const problems = [];
    const english = englishTokenizers(lab.words);
    const text = Object.fromEntries(lab.questions.map((question) => [question.id, question.text]));
    for (const [name, expected] of Object.entries(lab.bm25)) {
      const index = new BM25(lab.passages, english[name]);
      for (const [id, { tokens, top }] of Object.entries(expected)) {
        if (!same(english[name](text[id]), tokens)) problems.push(`${name}: ${id}'s words differ`);
        const found = index.search(text[id], 5);
        const agrees = found.length === top.length && found.every((hit, rank) => hit.passage.id === top[rank][0] && Math.abs(hit.score - top[rank][1]) < 1e-3);
        if (!agrees) problems.push(`${name}: ${id}'s top 5 differ`);
      }
    }
    for (const [lexical, fused] of [["bm25-stem", "rrf"], ["bm25-stop", "rrf-stop"]]) {
      for (const question of lab.questions.filter((item) => lab.lists.e5[item.id])) {
        const mine = rrf([lab.lists[lexical][question.id], lab.lists.e5[question.id]]).slice(0, 20).map(([passage]) => passage);
        if (!same(mine, lab.results[fused][question.id])) problems.push(`${fused}: ${question.id}'s order differs`);
      }
    }
    return problems;
  }

  const api = { tokenizers, englishTokenizers, BM25, rrf, weighted, check, checkEnglish };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LabBM25 = api;
})(this);
