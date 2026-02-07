import { type WordList } from "@keybr/content";
import { type Keyboard } from "@keybr/keyboard";
import { Filter, Letter, type PhoneticModel } from "@keybr/phonetic-model";
import { type RNGStream } from "@keybr/rand";
import { type KeyStatsMap } from "@keybr/result";
import { type Settings } from "@keybr/settings";
import { Dictionary, filterWordList } from "./dictionary.ts";
import { LessonKey, LessonKeys } from "./key.ts";
import { Lesson } from "./lesson.ts";
import { lessonProps } from "./settings.ts";
import { Target } from "./target.ts";
import { generateFragment } from "./text/fragment.ts";
import {
  mangledWords,
  mixKanaScripts,
  phoneticWords,
  randomWords,
  uniqueWords,
} from "./text/words.ts";

export class GuidedLesson extends Lesson {
  readonly dictionary: Dictionary;

  constructor(
    settings: Settings,
    keyboard: Keyboard,
    model: PhoneticModel,
    wordList: WordList,
  ) {
    super(settings, keyboard, model);
    const dictCodePoints =
      model.language.id === "ja"
        ? new Set(model.letters.map(({ codePoint }) => codePoint))
        : this.codePoints;
    this.dictionary = new Dictionary(
      filterWordList(wordList, dictCodePoints).filter(
        (word) => word.length > 2,
      ),
    );
  }

  override get letters() {
    return this.model.letters;
  }

  override update(keyStatsMap: KeyStatsMap) {
    const alphabetSize = this.settings.get(lessonProps.guided.alphabetSize);
    const recoverKeys = this.settings.get(lessonProps.guided.recoverKeys);

    const letters = this.#getLetters();

    const minSize = 6;
    const maxSize =
      minSize + Math.round((letters.length - minSize) * alphabetSize);

    const target = new Target(this.settings);

    const lessonKeys = new LessonKeys(
      letters.map((letter) => LessonKey.from(keyStatsMap.get(letter), target)),
    );

    for (const lessonKey of lessonKeys) {
      const includedKeys = lessonKeys.findIncludedKeys();

      if (includedKeys.length < minSize) {
        // Meet the minimal required alphabet size.
        lessonKeys.include(lessonKey.letter);
        continue;
      }

      if (includedKeys.length < maxSize) {
        // Meet the maximal required alphabet size.
        lessonKeys.force(lessonKey.letter);
        continue;
      }

      if ((lessonKey.bestConfidence ?? 0) >= 1) {
        // Must include all confident keys.
        lessonKeys.include(lessonKey.letter);
        continue;
      }

      if (recoverKeys) {
        if (includedKeys.every((key) => (key.confidence ?? 0) >= 1)) {
          // Include a new key only when all the previous keys
          // are now above the target speed.
          lessonKeys.include(lessonKey.letter);
          continue;
        }
      } else {
        if (includedKeys.every((key) => (key.bestConfidence ?? 0) >= 1)) {
          // Include a new key only when all the previous keys
          // were once above the target speed.
          lessonKeys.include(lessonKey.letter);
          continue;
        }
      }
    }

    // Find the least confident of all included keys and focus on it.
    const confidenceOf = (key: LessonKey): number => {
      return recoverKeys ? (key.confidence ?? 0) : (key.bestConfidence ?? 0);
    };
    const weakestKeys = lessonKeys
      .findIncludedKeys()
      .filter((key) => confidenceOf(key) < 1)
      .sort((a, b) => confidenceOf(a) - confidenceOf(b));
    if (weakestKeys.length > 0) {
      lessonKeys.focus(weakestKeys[0].letter);
    }

    return lessonKeys;
  }

  override generate(lessonKeys: LessonKeys, rng: RNGStream) {
    const filter = new Filter(
      lessonKeys.findIncludedKeys(),
      lessonKeys.findFocusedKey(),
    );
    const wordGenerator =
      this.model.language.id === "ja" &&
      this.keyboard.layout.id === "ja-romaji" &&
      this.settings.get(lessonProps.japanese.balanceKana)
        ? this.#makeBalancedWordGenerator(lessonKeys, rng)
        : this.#makeWordGenerator(filter, rng);
    let words = mangledWords(
      uniqueWords(wordGenerator),
      this.model.language,
      Letter.restrict(Letter.punctuators, this.codePoints),
      {
        withCapitals: this.settings.get(lessonProps.capitals),
        withPunctuators: this.settings.get(lessonProps.punctuators),
      },
      rng,
    );
    if (this.model.language.id === "ja") {
      words = mixKanaScripts(
        words,
        {
          katakanaRatio: this.settings.get(lessonProps.japanese.katakanaRatio),
        },
        rng,
      );
    }
    return generateFragment(this.settings, words, {
      repeatWords: this.settings.get(lessonProps.repeatWords),
    });
  }

  #getLetters() {
    const { letters } = this.model;
    if (this.model.language.id === "ja") {
      const order = new Map<number, number>();
      for (let i = 0; i < this.model.language.alphabet.length; i++) {
        order.set(this.model.language.alphabet[i], i);
      }
      const unknown = Number.MAX_SAFE_INTEGER;
      return [...letters].sort(
        (a, b) =>
          (order.get(a.codePoint) ?? unknown) -
            (order.get(b.codePoint) ?? unknown) ||
          a.codePoint - b.codePoint,
      );
    }

    const { codePoints } = this;
    if (this.settings.get(lessonProps.guided.keyboardOrder)) {
      return Letter.weightedFrequencyOrder(letters, ({ codePoint }) =>
        codePoints.weight(codePoint),
      );
    } else {
      return Letter.frequencyOrder(letters);
    }
  }

  #makeWordGenerator(filter: Filter, rng: RNGStream) {
    const pseudoWords = phoneticWords(this.model, filter, rng);
    if (this.settings.get(lessonProps.guided.naturalWords)) {
      const words = this.dictionary.find(filter).slice(0, 1000);
      while (words.length < 15) {
        const word = pseudoWords();
        if (word != null) {
          words.push(word);
        } else {
          break;
        }
      }
      if (words.length === 0) {
        words.push("?");
      }
      return randomWords(words, rng);
    }
    return pseudoWords;
  }

  #makeBalancedWordGenerator(lessonKeys: LessonKeys, rng: RNGStream) {
    const includedKeys = lessonKeys.findIncludedKeys();
    const focusedKey = lessonKeys.findFocusedKey();
    const baseFilter = new Filter(includedKeys, focusedKey);
    const baseGenerator = this.#makeWordGenerator(baseFilter, rng);
    if (focusedKey == null) {
      return baseGenerator;
    }
    const otherKeys = includedKeys.filter(
      (k) => k.letter.codePoint !== focusedKey.letter.codePoint,
    );
    if (otherKeys.length === 0) {
      return baseGenerator;
    }
    const otherGenerators = otherKeys.map((key) =>
      this.#makeWordGenerator(new Filter(includedKeys, key), rng),
    );
    let otherIndex = 0;
    let count = 0;
    // Keep the original keybr behavior (focused key in most words), but ensure
    // every unlocked kana appears regularly even if the phonetic model's
    // transitions make it rare with the current focus.
    return () => {
      count++;
      if (count % 4 !== 0) {
        return baseGenerator();
      }
      const gen = otherGenerators[otherIndex++ % otherGenerators.length];
      return gen();
    };
  }
}
