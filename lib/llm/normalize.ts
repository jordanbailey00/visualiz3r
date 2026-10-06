/**
 * Text normalization shared by training (scripts/llm/bpe.py `normalize_text`) and
 * inference. Both implementations must stay byte-for-byte identical:
 *
 *   1. Unicode NFKC
 *   2. U+2018 U+2019 U+201A U+2032 (curly single quotes, prime) -> '
 *      U+201C U+201D U+201E U+2033 (curly double quotes, double prime) -> "
 *      U+2013 U+2014 (en/em dash) -> -    U+2026 (ellipsis) -> ...    U+00A0 (NBSP) -> space
 *   3. strip control characters U+0000-U+001F (except "\n") and U+007F-U+009F, plus
 *      U+FEFF (JS `\s` matches it but Python's `\s` does not)
 *   4. replace lone UTF-16 surrogates with U+FFFD (they cannot be UTF-8 encoded)
 *
 * Case is preserved. After this step the tokenizer's pre-tokenization regex behaves
 * identically in Python `re` and JavaScript `RegExp`. (NFKC tables can differ between
 * runtimes for characters newer than Unicode 15.0; irrelevant for TinyStories text.)
 */

const CHAR_MAP: Readonly<Record<string, string>> = {
  "\u{2018}": "'", // left single quotation mark
  "\u{2019}": "'", // right single quotation mark
  "\u{201a}": "'", // single low-9 quotation mark
  "\u{2032}": "'", // prime
  "\u{201c}": '"', // left double quotation mark
  "\u{201d}": '"', // right double quotation mark
  "\u{201e}": '"', // double low-9 quotation mark
  "\u{2033}": '"', // double prime
  "\u{2013}": "-", // en dash
  "\u{2014}": "-", // em dash
  "\u{2026}": "...", // horizontal ellipsis
  "\u{00a0}": " ", // no-break space
};

const MAP_RE = new RegExp(`[${Object.keys(CHAR_MAP).join("")}]`, "g");
// eslint-disable-next-line no-control-regex
const STRIP_RE = /[\x00-\x09\x0b-\x1f\x7f-\x9f\u{feff}]/gu;
// with the `u` flag a valid surrogate pair is one code point, so this matches lone surrogates only
const LONE_SURROGATE_RE = /[\u{d800}-\u{dfff}]/gu;

export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(MAP_RE, (c) => CHAR_MAP[c])
    .replace(STRIP_RE, "")
    .replace(LONE_SURROGATE_RE, "\u{fffd}");
}
