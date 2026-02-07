import { type KeyId, useKeyboard } from "@keybr/keyboard";
import { type Result } from "@keybr/result";
import { type LineList, type TextInput } from "@keybr/textinput";
import {
  addKey,
  deleteKey,
  emulateLayout,
  type IInputEvent,
  RomajiIme,
  romajiOptionsForKana,
} from "@keybr/textinput-events";
import { makeSoundPlayer } from "@keybr/textinput-sounds";
import { type CodePoint } from "@keybr/unicode";
import {
  useDocumentEvent,
  useHotkeys,
  useTimeout,
  useWindowEvent,
} from "@keybr/widget";
import { memo, type ReactNode, useMemo, useRef, useState } from "react";
import { Presenter } from "./Presenter.tsx";
import {
  type LastLesson,
  LessonState,
  makeLastLesson,
  type Progress,
} from "./state/index.ts";

export const Controller = memo(function Controller({
  progress,
  onResult,
}: {
  readonly progress: Progress;
  readonly onResult: (result: Result) => void;
}): ReactNode {
  const {
    state,
    handleResetLesson,
    handleSkipLesson,
    handleKeyDown,
    handleKeyUp,
    handleInput,
  } = useLessonState(progress, onResult);
  useHotkeys({
    ["Ctrl+ArrowLeft"]: handleResetLesson,
    ["Ctrl+ArrowRight"]: handleSkipLesson,
    ["Escape"]: handleResetLesson,
  });
  useWindowEvent("focus", handleResetLesson);
  useWindowEvent("blur", handleResetLesson);
  useDocumentEvent("visibilitychange", handleResetLesson);
  return (
    <Presenter
      state={state}
      lines={state.lines}
      depressedKeys={state.depressedKeys}
      onResetLesson={handleResetLesson}
      onSkipLesson={handleSkipLesson}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onInput={handleInput}
    />
  );
});

function useLessonState(
  progress: Progress,
  onResult: (result: Result) => void,
) {
  const keyboard = useKeyboard();
  const timeout = useTimeout();
  const [key, setKey] = useState(0); // Creates new LessonState instances.
  const [, setLines] = useState<LineList>({ text: "", lines: [] }); // Forces UI update.
  const [, setDepressedKeys] = useState<readonly KeyId[]>([]); // Forces UI update.
  const lastLessonRef = useRef<LastLesson | null>(null);

  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  return useMemo(() => {
    // New lesson.
    const state = new LessonState(progress, (result, textInput) => {
      setKey(key + 1);
      lastLessonRef.current = makeLastLesson(result, textInput.steps);
      onResultRef.current(result);
    });
    state.lastLesson = lastLessonRef.current;
    state.imeEnabled = keyboard.layout.id === "ja-romaji";
    const ime = state.imeEnabled ? new RomajiIme() : null;
    const updateImeHints = () => {
      if (!state.imeEnabled) {
        state.imeHints = [];
        return;
      }
      const kana = expectedKana(state.textInput);
      state.imeHints = kana ? romajiOptionsForKana(kana) : [];
    };
    updateImeHints();
    setLines(state.lines);
    setDepressedKeys(state.depressedKeys);
    const handleResetLesson = () => {
      state.resetLesson();
      ime?.reset();
      state.imePreedit = "";
      state.imeValid = true;
      updateImeHints();
      setLines(state.lines);
      setDepressedKeys((state.depressedKeys = []));
      timeout.cancel();
    };
    const handleSkipLesson = () => {
      state.skipLesson();
      ime?.reset();
      state.imePreedit = "";
      state.imeValid = true;
      updateImeHints();
      setLines(state.lines);
      setDepressedKeys((state.depressedKeys = []));
      timeout.cancel();
    };
    const playSounds = makeSoundPlayer(state.settings);
    const { onKeyDown, onKeyUp, onInput } = emulateLayout(
      state.settings,
      keyboard,
      {
        onKeyDown: (event) => {
          setDepressedKeys(
            (state.depressedKeys = addKey(state.depressedKeys, event.code)),
          );
        },
        onKeyUp: (event) => {
          setDepressedKeys(
            (state.depressedKeys = deleteKey(state.depressedKeys, event.code)),
          );
        },
        onInput: (event) => {
          state.lastLesson = null;
          if (ime != null) {
            const res = ime.consume(event);
            state.imePreedit = res.preedit;
            state.imeValid = res.valid;
            for (const ev of res.events) {
              const mapped = mapKanaEventToExpected(ev, state.textInput);
              const feedback = state.onInput(mapped);
              playSounds(feedback);
            }
            updateImeHints();
            // Force UI update even if no events were emitted (preedit changed).
            setLines(state.lines);
            timeout.schedule(handleResetLesson, 10000);
          } else {
            const feedback = state.onInput(event);
            setLines(state.lines);
            playSounds(feedback);
            timeout.schedule(handleResetLesson, 10000);
          }
        },
      },
    );
    return {
      state,
      handleResetLesson,
      handleSkipLesson,
      handleKeyDown: onKeyDown,
      handleKeyUp: onKeyUp,
      handleInput: onInput,
    };
  }, [progress, keyboard, timeout, key]);
}

function mapKanaEventToExpected(
  event: IInputEvent,
  textInput: TextInput,
): IInputEvent {
  if (event.inputType !== "appendChar") {
    return event;
  }
  if (textInput.completed) {
    return event;
  }
  const expected = textInput.at(textInput.pos).codePoint as CodePoint;
  const codePoint = mapKanaCodePointToExpected(
    event.codePoint as CodePoint,
    expected,
  );
  return codePoint === event.codePoint ? event : { ...event, codePoint };
}

function mapKanaCodePointToExpected(
  actual: CodePoint,
  expected: CodePoint,
): CodePoint {
  // Katakana-Hiragana prolonged sound mark: keep as-is.
  if (actual === 0x30fc) {
    return actual;
  }
  if (isKatakanaCodePoint(expected) && isHiraganaCodePoint(actual)) {
    return (actual + 0x0060) as CodePoint;
  }
  return actual;
}

function expectedKana(textInput: TextInput): string {
  if (textInput.completed) {
    return "";
  }
  const a = textInput.at(textInput.pos).codePoint as CodePoint;
  const aH = katakanaToHiragana(a);
  const b =
    textInput.pos + 1 < textInput.length
      ? (textInput.at(textInput.pos + 1).codePoint as CodePoint)
      : null;
  const bH = b != null ? katakanaToHiragana(b) : null;
  if (isHiraganaCodePoint(aH) && isSmallYCodePoint(bH)) {
    return String.fromCodePoint(aH, bH!);
  }
  if (isHiraganaCodePoint(aH) || aH === 0x30fc) {
    return String.fromCodePoint(aH);
  }
  return "";
}

function katakanaToHiragana(codePoint: CodePoint): CodePoint {
  if (codePoint === 0x30fc) {
    return codePoint;
  }
  if (codePoint >= 0x30a1 && codePoint <= 0x30f6) {
    return (codePoint - 0x0060) as CodePoint;
  }
  return codePoint;
}

function isHiraganaCodePoint(codePoint: CodePoint): boolean {
  return codePoint >= 0x3041 && codePoint <= 0x3096;
}

function isKatakanaCodePoint(codePoint: CodePoint): boolean {
  return codePoint >= 0x30a1 && codePoint <= 0x30f6;
}

function isSmallYCodePoint(codePoint: CodePoint | null): boolean {
  if (codePoint == null) {
    return false;
  }
  return codePoint === 0x3083 || codePoint === 0x3085 || codePoint === 0x3087; // ゃゅょ
}
