// lab/eval/metrics.py in JavaScript. gains[i]: how many targets not seen higher up the passage at rank i + 1 brought.
(function (root) {
  function recallAt(gains, total, k) {
    return gains.slice(0, k).reduce((sum, gain) => sum + gain, 0) / total;
  }

  function reciprocal(gains) {
    const index = gains.findIndex((gain) => gain);
    return index < 0 ? 0 : 1 / (index + 1);
  }

  function dcg(gains) {
    return gains.reduce((sum, gain, index) => sum + gain / Math.log2(index + 2), 0);
  }

  // A passage holding two targets can beat the one-target-per-passage ideal, so cap at 1.
  function ndcgAt(gains, total, k) {
    return Math.min(1, dcg(gains.slice(0, k)) / dcg(Array(Math.min(total, k)).fill(1)));
  }

  function gainsOf(question, ids) {
    const found = new Set();
    return ids.map((id) => {
      let gain = 0;
      question.targets.forEach((target, index) => {
        if (!found.has(index) && target.passages.includes(id)) { found.add(index); gain += 1; }
      });
      return gain;
    });
  }

  // Every search whose averages, recomputed here from its stored rankings, differ from Python's.
  function checkMetrics(lab) {
    const problems = [];
    const answerable = lab.questions.filter((question) => question.targets.length);
    for (const [key, found] of Object.entries(lab.results)) {
      const last = lab.results[`${key.split("/")[0]}/last`];
      const scores = answerable.map((question) => {
        const gains = gainsOf(question, (found[question.id] || last[question.id]).slice(0, 10).map((row) => row[0]));
        const total = question.targets.length;
        return { "recall@1": recallAt(gains, total, 1), "recall@5": recallAt(gains, total, 5), MRR: reciprocal(gains), "nDCG@10": ndcgAt(gains, total, 10) };
      });
      for (const metric of ["recall@1", "recall@5", "MRR", "nDCG@10"]) {
        const mean = scores.reduce((sum, score) => sum + score[metric], 0) / scores.length;
        if (Math.abs(mean - lab.metrics[key].all.summary[metric]) > 1e-5) problems.push(`${key} ${metric}: ${mean.toFixed(4)}, Python: ${lab.metrics[key].all.summary[metric].toFixed(4)}`);
      }
    }
    return problems;
  }

  const api = { recallAt, reciprocal, dcg, ndcgAt, gainsOf, checkMetrics };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LabMetrics = api;
})(this);
