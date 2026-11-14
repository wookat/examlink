/* LaTeX → readable unicode math (offline, no KaTeX dependency) +
   minimal markdown renderer. Ported verbatim behavior from web/app.js. */

const SUP_C: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", "n": "ⁿ", "i": "ⁱ", "x": "ˣ", "a": "ᵃ", "b": "ᵇ", "c": "ᶜ", "t": "ᵗ", "k": "ᵏ", "m": "ᵐ" };
const SUB_C: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", "a": "ₐ", "e": "ₑ", "o": "ₒ", "x": "ₓ", "i": "ᵢ", "n": "ₙ", "r": "ᵣ", "t": "ₜ", "k": "ₖ", "m": "ₘ", "s": "ₛ", "u": "ᵤ", "v": "ᵥ" };
const LATEX_OPS: Record<string, string> = { times: "×", div: "÷", pm: "±", mp: "∓", cdot: "·", ast: "∗", le: "≤", leq: "≤", ge: "≥", geq: "≥",
  neq: "≠", ne: "≠", approx: "≈", sim: "∼", cong: "≅", equiv: "≡", propto: "∝", infty: "∞",
  pi: "π", alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", epsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", rho: "ρ", sigma: "σ", Sigma: "Σ", tau: "τ", phi: "φ", Phi: "Φ",
  chi: "χ", psi: "ψ", omega: "ω", Omega: "Ω",
  sum: "∑", prod: "∏", int: "∫", oint: "∮", partial: "∂", nabla: "∇", sqrt: "√",
  in: "∈", ni: "∋", notin: "∉", subset: "⊂", supset: "⊃", subseteq: "⊆", supseteq: "⊇",
  cup: "∪", cap: "∩", emptyset: "∅", forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨",
  to: "→", gets: "←", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftarrow: "⇐", mapsto: "↦",
  lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉", langle: "⟨", rangle: "⟩",
  log: "log", ln: "ln", lg: "lg", sin: "sin", cos: "cos", tan: "tan", cot: "cot", sec: "sec", csc: "csc",
  arcsin: "arcsin", arccos: "arccos", arctan: "arctan", exp: "exp", max: "max", min: "min", lim: "lim", deg: "°" };

const _sup = (s: string) => [...s].map(c => SUP_C[c] ?? ("^" + c)).join("");
const _sub = (s: string) => [...s].map(c => SUB_C[c] ?? ("_" + c)).join("");

export function latexFix(t: string): string {
  return t.split(/(`{1,3}[\s\S]*?`{1,3})/g).map((part, i) => {
    if (i % 2) return part;                 // keep code spans verbatim
    return part
      .replace(/\\\[|\\\]|\\\(|\\\)|\$\$/g, "")
      .replace(/\$([^$\n]+)\$/g, "$1")
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => `(${a})⁄(${b})`)
      .replace(/\\sqrt\[([^\]]*)\]\{([^{}]*)\}/g, (_, n, x) => _sup(n) + `√(${x})`)
      .replace(/\\sqrt\{([^{}]*)\}/g, "√($1)")
      .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|boldsymbol?)\{([^{}]*)\}/g, "$1")
      .replace(/\\(?:left|right|big|Big|bigg|Bigg)\s*/g, "")
      .replace(/\^\{([^{}]*)\}/g, (_, g) => _sup(g))
      .replace(/\^([0-9a-zA-Z+\-=()ntkxbm])/g, (_, c) => _sup(c))
      .replace(/_\{([^{}]*)\}/g, (_, g) => _sub(g))
      .replace(/_([0-9aeoxinrkmsuv])/g, (_, c) => _sub(c))
      .replace(/\\([a-zA-Z]+)/g, (m, name) => LATEX_OPS[name] ?? name)
      .replace(/\\([%$&#_{}])/g, "$1")
      .replace(/\\[,;:!]/g, " ");
  }).join("");
}

/* minimal markdown renderer (same output shape as the old md()) */
export function md(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let s = esc(latexFix(src));
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => `<pre><code>${c.replace(/\n$/, "")}</code></pre>`);
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/^######\s*(.+)$/gm, "<h6>$1</h6>")
       .replace(/^###\s*(.+)$/gm, "<h4>$1</h4>")
       .replace(/^##\s*(.+)$/gm, "<h3>$1</h3>")
       .replace(/^#\s*(.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/((?:^\s*[-*]\s+.+\n?)+)/gm, m =>
    "<ul>" + m.replace(/^\s*[-*]\s+(.+)$/gm, "<li>$1</li>") + "</ul>");
  s = s.replace(/((?:^\s*\d+[.)]\s+.+\n?)+)/gm, m =>
    "<ol>" + m.replace(/^\s*\d+[.)]\s+(.+)$/gm, "<li>$1</li>") + "</ol>");
  s = s.split(/(<\/?(?:ul|ol|pre|h[3-6]|li|p|code|b|blockquote|table|th|td|tr)[^>]*>)/).map(part => {
    if (part.startsWith("<")) return part;
    return part.split(/\n{2,}/).map(p => p.trim() ? `<p>${p.replace(/\n/g, "<br>")}</p>` : "").join("");
  }).join("");
  return s;
}
