/**
 * hangul.ts - Korean (Hangul) handling for FTS5 queries.
 *
 * lemon-qmd patch stack: all Hangul-specific logic lives here so store.ts keeps
 * at most two call sites. Han and kana text never reaches these functions.
 */

const HANGUL_WORD_PATTERN = /^\p{Script=Hangul}+$/u;

// Particles (design §4) plus the nominalizing ending 기 (`나누기` → `나누`).
// Longest first, so 에서 wins over 에 and 으로 over 로.
const SUFFIXES = [
  "에게", "에서", "으로", "까지", "부터", "처럼",
  "은", "는", "이", "가", "을", "를", "에", "로", "의", "도", "와", "과", "기",
];

const MIN_STEM_SYLLABLES = 2;

/**
 * Strip one trailing particle (or 기) from a pure-Hangul word when the stem
 * keeps at least two syllables (`검색을` → `검색`, `책을` stays). Returns null
 * when nothing is stripped.
 */
export function stripHangulParticle(word: string): string | null {
  if (!HANGUL_WORD_PATTERN.test(word)) return null;
  const syllables = Array.from(word);
  for (const suffix of SUFFIXES) {
    const stemLength = syllables.length - suffix.length;
    if (stemLength < MIN_STEM_SYLLABLES) continue;
    if (word.endsWith(suffix)) return syllables.slice(0, stemLength).join("");
  }
  return null;
}

/**
 * FTS5 expression for a plain (unquoted) Hangul query term: stem phrase OR
 * original phrase over the character tokens produced by normalizeCjkForFTS
 * (`검색을` → `("검 색" OR "검 색 을")`). Returns null when the term is not a
 * strippable Hangul word, so the caller keeps its default CJK phrase.
 */
export function hangulTermQuery(term: string): string | null {
  const stem = stripHangulParticle(term);
  if (!stem) return null;
  const phrase = (s: string) => `"${Array.from(s).join(" ")}"`;
  return `(${phrase(stem)} OR ${phrase(term)})`;
}
