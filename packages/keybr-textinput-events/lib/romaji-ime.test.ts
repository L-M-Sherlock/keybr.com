import { test } from "node:test";
import { deepEqual, equal } from "rich-assert";
import { RomajiIme, romajiOptionsForKana } from "./romaji-ime.ts";
import { type IInputEvent } from "./types.ts";

function ch(
  s: string,
  { timeStamp, timeToType = 100 }: { timeStamp: number; timeToType?: number } = { timeStamp: 0 },
): IInputEvent {
  return {
    type: "input",
    timeStamp,
    inputType: "appendChar",
    codePoint: s.codePointAt(0)!,
    timeToType,
  };
}

function space(timeStamp: number): IInputEvent {
  return ch(" ", { timeStamp });
}

function collect(ime: RomajiIme, ...events: IInputEvent[]): number[] {
  const out: number[] = [];
  for (const ev of events) {
    const res = ime.consume(ev);
    out.push(...res.events.map((e) => e.codePoint));
  }
  return out;
}

test("kya -> きゃ", () => {
  const ime = new RomajiIme();
  const cps = collect(ime, ch("k", { timeStamp: 1 }), ch("y", { timeStamp: 2 }), ch("a", { timeStamp: 3 }));
  deepEqual(cps, ["き".codePointAt(0)!, "ゃ".codePointAt(0)!]);
});

test("si -> し (Kunrei compatible)", () => {
  const ime = new RomajiIme();
  const cps = collect(ime, ch("s", { timeStamp: 1 }), ch("i", { timeStamp: 2 }));
  deepEqual(cps, ["し".codePointAt(0)!]);
});

test("n + space keeps preedit and swallows space", () => {
  const ime = new RomajiIme();
  const cps = collect(ime, ch("n", { timeStamp: 1 }), space(2));
  deepEqual(cps, []);
});

test("kka -> っか", () => {
  const ime = new RomajiIme();
  const cps = collect(ime, ch("k", { timeStamp: 1 }), ch("k", { timeStamp: 2 }), ch("a", { timeStamp: 3 }));
  deepEqual(cps, ["っ".codePointAt(0)!, "か".codePointAt(0)!]);
});

test("invalid romaji keeps preedit and swallows boundary", () => {
  const ime = new RomajiIme();
  const r1 = ime.consume(ch("q", { timeStamp: 1 }));
  equal(r1.valid, false);
  equal(r1.preedit, "q");
  deepEqual(r1.events, []);

  const r2 = ime.consume(space(2));
  equal(r2.valid, false);
  equal(r2.preedit, "q");
  deepEqual(r2.events, []);
});

test("romaji options for ん", () => {
  deepEqual(romajiOptionsForKana("ん"), ["nn", "n'", "n+consonant"]);
});
