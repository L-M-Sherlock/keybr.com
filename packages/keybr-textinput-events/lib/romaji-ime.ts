import { type CodePoint } from "@keybr/unicode";
import { type IInputEvent } from "./types.ts";

export type RomajiImeResult = {
  readonly events: readonly IInputEvent[];
  readonly preedit: string;
  readonly valid: boolean;
};

type TrieNode = Readonly<{
  readonly children: ReadonlyMap<string, TrieNode>;
  readonly outputs: readonly Output[];
}>;

type Output = Readonly<{
  readonly kana: string;
  /** Lower value means higher priority (Hepburn first, Kunrei-compatible later). */
  readonly priority: number;
}>;

export class RomajiIme {
  #buffer = "";
  #times: number[] = [];
  #valid = true;

  reset(): void {
    this.#buffer = "";
    this.#times = [];
    this.#valid = true;
  }

  get preedit(): string {
    return this.#buffer;
  }

  get valid(): boolean {
    return this.#valid;
  }

  consume(event: IInputEvent): RomajiImeResult {
    switch (event.inputType) {
      case "appendLineBreak":
        return this.#flushThenForward(event, /* atBoundary= */ true);
      case "clearWord":
        this.reset();
        return { events: [event], preedit: this.#buffer, valid: this.#valid };
      case "clearChar":
        if (this.#buffer.length > 0) {
          this.#buffer = this.#buffer.slice(0, -1);
          this.#times.pop();
          this.#valid = this.#isPrefix(this.#buffer);
          return { events: [], preedit: this.#buffer, valid: this.#valid };
        }
        return { events: [event], preedit: this.#buffer, valid: this.#valid };
      case "appendChar":
        return this.#appendChar(event);
    }
  }

  #appendChar(event: IInputEvent): RomajiImeResult {
    const ch = String.fromCodePoint(event.codePoint);
    // Word boundary: flush pending romaji, then forward the boundary character.
    if (ch === " ") {
      // Do not treat space as a hard boundary for a lone trailing "n".
      // This keeps "n" pending (requires "nn"/"n'" or continuation typing),
      // and avoids training the user to use Space to commit ん.
      return this.#flushThenForward(event, /* atBoundary= */ false);
    }
    // Long vowel mark for katakana words.
    if (ch === "-") {
      return this.#flushThenForward(
        {
          ...event,
          codePoint: PROLONGED_SOUND_MARK,
        },
        /* atBoundary= */ false,
      );
    }

    if (isAsciiLetter(ch) || ch === "'") {
      this.#buffer += ch.toLowerCase();
      this.#times.push(event.timeToType);
      const events = this.#flush(/* atBoundary= */ false, event.timeStamp);
      this.#valid = this.#isPrefix(this.#buffer);
      return { events, preedit: this.#buffer, valid: this.#valid };
    }

    // Any other character ends the current romaji sequence.
    return this.#flushThenForward(event, /* atBoundary= */ true);
  }

  #flushThenForward(event: IInputEvent, atBoundary: boolean): RomajiImeResult {
    const events = this.#flush(atBoundary, event.timeStamp);
    if (this.#buffer.length === 0 && this.#valid) {
      return { events: [...events, event], preedit: this.#buffer, valid: true };
    }
    // If romaji is incomplete/invalid, swallow the boundary character to force
    // the user to fix the preedit first.
    return { events, preedit: this.#buffer, valid: this.#valid };
  }

  #flush(atBoundary: boolean, timeStamp: number): IInputEvent[] {
    const out: IInputEvent[] = [];

    while (this.#buffer.length > 0) {
      // Handle "n" rules for ん.
      if (this.#buffer.startsWith("n'")) {
        const strokes = 2;
        out.push(
          ...this.#emitKana("ん", timeStamp, this.#consume(strokes), strokes),
        );
        continue;
      }
      if (this.#buffer.startsWith("nn")) {
        const strokes = 2;
        out.push(
          ...this.#emitKana("ん", timeStamp, this.#consume(strokes), strokes),
        );
        continue;
      }
      if (this.#buffer === "n") {
        if (atBoundary) {
          const strokes = 1;
          out.push(
            ...this.#emitKana("ん", timeStamp, this.#consume(strokes), strokes),
          );
        }
        break; // Wait for more input or boundary.
      }
      if (this.#buffer.startsWith("n")) {
        const next = this.#buffer[1];
        if (next != null && !isVowel(next) && next !== "y" && next !== "'") {
          const strokes = 1;
          out.push(
            ...this.#emitKana("ん", timeStamp, this.#consume(strokes), strokes),
          );
          continue;
        }
      }

      // Handle small っ for doubled consonants.
      if (this.#buffer.length >= 2) {
        const a = this.#buffer[0];
        const b = this.#buffer[1];
        if (a === b && isConsonant(a) && a !== "n") {
          const strokes = 1;
          out.push(
            ...this.#emitKana("っ", timeStamp, this.#consume(strokes), strokes),
          );
          continue;
        }
      }

      const match = findBestMatch(TRIE, this.#buffer);
      if (match == null) {
        // If current buffer is a valid prefix, wait for more input.
        if (this.#isPrefix(this.#buffer)) {
          break;
        }
        this.#valid = false;
        break;
      }

      // Avoid committing a lone "n" unless it's at boundary or disambiguated.
      if (match.romaji === "n") {
        if (this.#buffer.length > 1) {
          // "na" etc should have been matched instead of "n".
          this.#valid = false;
        }
        break;
      }

      out.push(
        ...this.#emitKana(
          match.output.kana,
          timeStamp,
          this.#consume(match.romaji.length),
          match.romaji.length,
        ),
      );
    }

    this.#valid = this.#isPrefix(this.#buffer);
    return out;
  }

  #emitKana(
    kana: string,
    timeStamp: number,
    timeToType: number,
    strokes: number,
  ): IInputEvent[] {
    const cps = [...kana].map((c) => c.codePointAt(0)! as CodePoint);
    // Normalize time to type per physical keystroke.
    // Without this, kana that require more romaji keystrokes (e.g. か = "ka")
    // will look artificially "slow" and can block guided progression.
    const per = strokes > 0 ? timeToType / strokes : timeToType;
    return cps.map((codePoint) => ({
      type: "input",
      timeStamp,
      inputType: "appendChar",
      codePoint,
      timeToType: per,
    }));
  }

  #consume(n: number): number {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += this.#times[i] ?? 0;
    }
    this.#buffer = this.#buffer.slice(n);
    this.#times.splice(0, n);
    return sum;
  }

  #isPrefix(s: string): boolean {
    if (s === "") {
      return true;
    }
    // Special-case: "n" is always a prefix.
    if (s === "n") {
      return true;
    }
    return isPrefix(TRIE, s);
  }
}

export function romajiOptionsForKana(kana: string): readonly string[] {
  if (kana === "ん" || kana === "ン") {
    return ["nn", "n'", "n+consonant"];
  }
  const list = REVERSE.get(kana);
  return list ?? [];
}

type Match = { readonly romaji: string; readonly output: Output };

function findBestMatch(root: TrieNode, input: string): Match | null {
  let node: TrieNode | null = root;
  let best: Match | null = null;
  for (let i = 0; i < input.length; i++) {
    node = node.children.get(input[i]) ?? null;
    if (node == null) {
      break;
    }
    if (node.outputs.length > 0) {
      const output = [...node.outputs].sort(
        (a, b) => a.priority - b.priority,
      )[0];
      best = { romaji: input.slice(0, i + 1), output };
    }
  }
  return best;
}

function isPrefix(root: TrieNode, input: string): boolean {
  let node: TrieNode | null = root;
  for (let i = 0; i < input.length; i++) {
    node = node.children.get(input[i]) ?? null;
    if (node == null) {
      return false;
    }
  }
  return true;
}

function buildTrie(
  entries: readonly {
    readonly romaji: string;
    readonly kana: string;
    readonly priority: number;
  }[],
): TrieNode {
  type MutableNode = {
    children: Map<string, MutableNode>;
    outputs: Output[];
  };
  const root: MutableNode = { children: new Map(), outputs: [] };
  for (const { romaji, kana, priority } of entries) {
    let node = root;
    for (const ch of romaji) {
      let next = node.children.get(ch);
      if (next == null) {
        node.children.set(ch, (next = { children: new Map(), outputs: [] }));
      }
      node = next;
    }
    node.outputs.push({ kana, priority });
  }
  const freeze = (node: MutableNode): TrieNode => {
    const children = new Map<string, TrieNode>();
    for (const [k, v] of node.children) {
      children.set(k, freeze(v));
    }
    return Object.freeze({
      children: children,
      outputs: Object.freeze([...node.outputs]),
    });
  };
  return freeze(root);
}

function buildReverse(
  entries: readonly {
    readonly romaji: string;
    readonly kana: string;
    readonly priority: number;
  }[],
): Map<string, readonly string[]> {
  const map = new Map<string, { romaji: string; priority: number }[]>();
  for (const { romaji, kana, priority } of entries) {
    let list = map.get(kana);
    if (list == null) {
      map.set(kana, (list = []));
    }
    list.push({ romaji, priority });
  }
  const out = new Map<string, readonly string[]>();
  for (const [kana, list] of map) {
    out.set(
      kana,
      Object.freeze(
        [...list]
          .sort(
            (a, b) =>
              a.priority - b.priority || a.romaji.localeCompare(b.romaji),
          )
          .map((x) => x.romaji),
      ),
    );
  }
  return out;
}

function isAsciiLetter(ch: string): boolean {
  return ch.length === 1 && ch >= "A" && ch <= "z" && /[A-Za-z]/.test(ch);
}

function isVowel(ch: string): boolean {
  return ch === "a" || ch === "i" || ch === "u" || ch === "e" || ch === "o";
}

function isConsonant(ch: string): boolean {
  return ch >= "a" && ch <= "z" && !isVowel(ch);
}

const PROLONGED_SOUND_MARK = 0x30fc as CodePoint; // ー

// Hepburn-first (priority 0), then Kunrei-compatible alternates.
const ENTRIES = [
  // Vowels
  { romaji: "a", kana: "あ", priority: 0 },
  { romaji: "i", kana: "い", priority: 0 },
  { romaji: "u", kana: "う", priority: 0 },
  { romaji: "e", kana: "え", priority: 0 },
  { romaji: "o", kana: "お", priority: 0 },

  // K
  { romaji: "ka", kana: "か", priority: 0 },
  { romaji: "ki", kana: "き", priority: 0 },
  { romaji: "ku", kana: "く", priority: 0 },
  { romaji: "ke", kana: "け", priority: 0 },
  { romaji: "ko", kana: "こ", priority: 0 },

  // S
  { romaji: "sa", kana: "さ", priority: 0 },
  { romaji: "shi", kana: "し", priority: 0 },
  { romaji: "si", kana: "し", priority: 1 },
  { romaji: "su", kana: "す", priority: 0 },
  { romaji: "se", kana: "せ", priority: 0 },
  { romaji: "so", kana: "そ", priority: 0 },

  // T
  { romaji: "ta", kana: "た", priority: 0 },
  { romaji: "chi", kana: "ち", priority: 0 },
  { romaji: "ti", kana: "ち", priority: 1 },
  { romaji: "tsu", kana: "つ", priority: 0 },
  { romaji: "tu", kana: "つ", priority: 1 },
  { romaji: "te", kana: "て", priority: 0 },
  { romaji: "to", kana: "と", priority: 0 },

  // N
  { romaji: "na", kana: "な", priority: 0 },
  { romaji: "ni", kana: "に", priority: 0 },
  { romaji: "nu", kana: "ぬ", priority: 0 },
  { romaji: "ne", kana: "ね", priority: 0 },
  { romaji: "no", kana: "の", priority: 0 },

  // H
  { romaji: "ha", kana: "は", priority: 0 },
  { romaji: "hi", kana: "ひ", priority: 0 },
  { romaji: "fu", kana: "ふ", priority: 0 },
  { romaji: "hu", kana: "ふ", priority: 1 },
  { romaji: "fa", kana: "ふぁ", priority: 0 },
  { romaji: "fi", kana: "ふぃ", priority: 0 },
  { romaji: "fe", kana: "ふぇ", priority: 0 },
  { romaji: "fo", kana: "ふぉ", priority: 0 },
  { romaji: "he", kana: "へ", priority: 0 },
  { romaji: "ho", kana: "ほ", priority: 0 },

  // M
  { romaji: "ma", kana: "ま", priority: 0 },
  { romaji: "mi", kana: "み", priority: 0 },
  { romaji: "mu", kana: "む", priority: 0 },
  { romaji: "me", kana: "め", priority: 0 },
  { romaji: "mo", kana: "も", priority: 0 },

  // Y
  { romaji: "ya", kana: "や", priority: 0 },
  { romaji: "yu", kana: "ゆ", priority: 0 },
  { romaji: "yo", kana: "よ", priority: 0 },

  // R
  { romaji: "ra", kana: "ら", priority: 0 },
  { romaji: "ri", kana: "り", priority: 0 },
  { romaji: "ru", kana: "る", priority: 0 },
  { romaji: "re", kana: "れ", priority: 0 },
  { romaji: "ro", kana: "ろ", priority: 0 },

  // W
  { romaji: "wa", kana: "わ", priority: 0 },
  { romaji: "wo", kana: "を", priority: 0 },

  // G
  { romaji: "ga", kana: "が", priority: 0 },
  { romaji: "gi", kana: "ぎ", priority: 0 },
  { romaji: "gu", kana: "ぐ", priority: 0 },
  { romaji: "ge", kana: "げ", priority: 0 },
  { romaji: "go", kana: "ご", priority: 0 },

  // Z/J
  { romaji: "za", kana: "ざ", priority: 0 },
  { romaji: "ji", kana: "じ", priority: 0 },
  { romaji: "zi", kana: "じ", priority: 1 },
  { romaji: "zu", kana: "ず", priority: 0 },
  { romaji: "ze", kana: "ぜ", priority: 0 },
  { romaji: "zo", kana: "ぞ", priority: 0 },

  // D
  { romaji: "da", kana: "だ", priority: 0 },
  { romaji: "di", kana: "ぢ", priority: 1 },
  { romaji: "du", kana: "づ", priority: 1 },
  { romaji: "de", kana: "で", priority: 0 },
  { romaji: "do", kana: "ど", priority: 0 },

  // B
  { romaji: "ba", kana: "ば", priority: 0 },
  { romaji: "bi", kana: "び", priority: 0 },
  { romaji: "bu", kana: "ぶ", priority: 0 },
  { romaji: "be", kana: "べ", priority: 0 },
  { romaji: "bo", kana: "ぼ", priority: 0 },

  // P
  { romaji: "pa", kana: "ぱ", priority: 0 },
  { romaji: "pi", kana: "ぴ", priority: 0 },
  { romaji: "pu", kana: "ぷ", priority: 0 },
  { romaji: "pe", kana: "ぺ", priority: 0 },
  { romaji: "po", kana: "ぽ", priority: 0 },

  // Youon
  { romaji: "kya", kana: "きゃ", priority: 0 },
  { romaji: "kyu", kana: "きゅ", priority: 0 },
  { romaji: "kyo", kana: "きょ", priority: 0 },
  { romaji: "gya", kana: "ぎゃ", priority: 0 },
  { romaji: "gyu", kana: "ぎゅ", priority: 0 },
  { romaji: "gyo", kana: "ぎょ", priority: 0 },
  { romaji: "sha", kana: "しゃ", priority: 0 },
  { romaji: "sya", kana: "しゃ", priority: 1 },
  { romaji: "shu", kana: "しゅ", priority: 0 },
  { romaji: "syu", kana: "しゅ", priority: 1 },
  { romaji: "sho", kana: "しょ", priority: 0 },
  { romaji: "syo", kana: "しょ", priority: 1 },
  { romaji: "cha", kana: "ちゃ", priority: 0 },
  { romaji: "tya", kana: "ちゃ", priority: 1 },
  { romaji: "chu", kana: "ちゅ", priority: 0 },
  { romaji: "tyu", kana: "ちゅ", priority: 1 },
  { romaji: "cho", kana: "ちょ", priority: 0 },
  { romaji: "tyo", kana: "ちょ", priority: 1 },
  { romaji: "nya", kana: "にゃ", priority: 0 },
  { romaji: "nyu", kana: "にゅ", priority: 0 },
  { romaji: "nyo", kana: "にょ", priority: 0 },
  { romaji: "hya", kana: "ひゃ", priority: 0 },
  { romaji: "hyu", kana: "ひゅ", priority: 0 },
  { romaji: "hyo", kana: "ひょ", priority: 0 },
  { romaji: "mya", kana: "みゃ", priority: 0 },
  { romaji: "myu", kana: "みゅ", priority: 0 },
  { romaji: "myo", kana: "みょ", priority: 0 },
  { romaji: "rya", kana: "りゃ", priority: 0 },
  { romaji: "ryu", kana: "りゅ", priority: 0 },
  { romaji: "ryo", kana: "りょ", priority: 0 },
  { romaji: "bya", kana: "びゃ", priority: 0 },
  { romaji: "byu", kana: "びゅ", priority: 0 },
  { romaji: "byo", kana: "びょ", priority: 0 },
  { romaji: "pya", kana: "ぴゃ", priority: 0 },
  { romaji: "pyu", kana: "ぴゅ", priority: 0 },
  { romaji: "pyo", kana: "ぴょ", priority: 0 },
  { romaji: "ja", kana: "じゃ", priority: 0 },
  { romaji: "jya", kana: "じゃ", priority: 1 },
  { romaji: "zya", kana: "じゃ", priority: 2 },
  { romaji: "ju", kana: "じゅ", priority: 0 },
  { romaji: "jyu", kana: "じゅ", priority: 1 },
  { romaji: "jyo", kana: "じょ", priority: 1 },
  { romaji: "jo", kana: "じょ", priority: 0 },

  // Small vowels / small ya/yu/yo / small tsu
  { romaji: "xa", kana: "ぁ", priority: 0 },
  { romaji: "xi", kana: "ぃ", priority: 0 },
  { romaji: "xu", kana: "ぅ", priority: 0 },
  { romaji: "xe", kana: "ぇ", priority: 0 },
  { romaji: "xo", kana: "ぉ", priority: 0 },
  { romaji: "la", kana: "ぁ", priority: 1 },
  { romaji: "li", kana: "ぃ", priority: 1 },
  { romaji: "lu", kana: "ぅ", priority: 1 },
  { romaji: "le", kana: "ぇ", priority: 1 },
  { romaji: "lo", kana: "ぉ", priority: 1 },
  { romaji: "xya", kana: "ゃ", priority: 0 },
  { romaji: "xyu", kana: "ゅ", priority: 0 },
  { romaji: "xyo", kana: "ょ", priority: 0 },
  { romaji: "lya", kana: "ゃ", priority: 1 },
  { romaji: "lyu", kana: "ゅ", priority: 1 },
  { romaji: "lyo", kana: "ょ", priority: 1 },
  { romaji: "xtsu", kana: "っ", priority: 0 },
  { romaji: "ltsu", kana: "っ", priority: 1 },
];

const TRIE = buildTrie(ENTRIES);
const REVERSE = buildReverse(ENTRIES);
