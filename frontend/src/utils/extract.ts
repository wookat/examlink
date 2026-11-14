/* Answer/title extraction — same regexes as the old frontend so the
   hero chip + giant letter behave identically. */

export interface AnswerExtract {
  answer: string;        // raw "答案 X" value
  letter: string;        // option letters if the answer starts with A-F… else ""
  rest: string;          // text after the letters
  textAns: boolean;      // true when the answer is free text, not letters
}

export function extractAnswer(text: string): AnswerExtract | null {
  const m = text && text.match(/答案[:：]\s*\**\s*([^\n*]{1,24})/);
  if (!m) return null;
  const ans = m[1].trim().replace(/\*+$/, "");
  const lm = ans.match(/^([A-FＡ-Ｆ]{1,6})\s*(.*)$/);
  return {
    answer: ans,
    letter: lm ? lm[1] : ans,
    rest: lm ? lm[2] : "",
    textAns: !lm,
  };
}

/** Strip duplicated "答案：X" lines from the body — the hero shows it already. */
export function stripAnswerLines(text: string): string {
  return text.split("\n")
    .filter(l => !/^\s*[*_#>\-\s]*\*{0,2}(?:最终|最后|正确|参考)?答案(?:为|是)?\s*[:：]/.test(l))
    .join("\n");
}

/** First meaningful (non-answer) line, ≤34 chars — the keyword summary.
    Also parses the exam paper's own question number ("8. 审计某企业时…"). */
export function extractTitle(text: string): { title: string; qno: string } | null {
  const lines = (text || "").split("\n").map(l =>
    l.replace(/^[#>*\-\s]+/, "").replace(/\*\*/g, "").trim()).filter(Boolean);
  const title = lines.find(l => !/^答案[:：]/.test(l));
  if (!title) return null;
  const qm = title.match(/^(?:第\s*)?(\d{1,3})\s*[.、．)）\s题]/);
  return { title: title.slice(0, 34), qno: qm ? qm[1] : "" };
}
