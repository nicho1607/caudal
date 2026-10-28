import { afterEach, describe, expect, it } from "vitest";

import { isOverlayOpen, isTypingTarget, matchesHotkey } from "@/hooks/use-hotkeys";

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

describe("matchesHotkey", () => {
  it("n sin modificadores", () => {
    expect(matchesHotkey(key({ key: "n" }), "n")).toBe(true);
    expect(matchesHotkey(key({ key: "N", shiftKey: true }), "n")).toBe(false);
    expect(matchesHotkey(key({ key: "n", ctrlKey: true }), "n")).toBe(false);
  });

  it("mod+k = Cmd o Ctrl", () => {
    expect(matchesHotkey(key({ key: "k", metaKey: true }), "mod+k")).toBe(true);
    expect(matchesHotkey(key({ key: "k", ctrlKey: true }), "mod+k")).toBe(true);
    expect(matchesHotkey(key({ key: "k" }), "mod+k")).toBe(false);
  });
});

describe("isTypingTarget / isOverlayOpen", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("inputs, textareas, selects y contenteditable", () => {
    document.body.innerHTML = [
      '<input id="i"><textarea id="t"></textarea><select id="s"></select>',
      '<div contenteditable="true"><span id="c">x</span></div><button id="b"></button>',
    ].join("");
    for (const id of ["i", "t", "s", "c"]) expect(isTypingTarget(document.getElementById(id))).toBe(true);
    expect(isTypingTarget(document.getElementById("b"))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
  });

  it("diálogo o menú abierto", () => {
    expect(isOverlayOpen()).toBe(false);
    document.body.innerHTML = '<div role="dialog"></div>';
    expect(isOverlayOpen()).toBe(true);
    document.body.innerHTML = '<div role="menu"></div>';
    expect(isOverlayOpen()).toBe(true);
    // Radix mantiene el contenido mientras anima el cierre.
    document.body.innerHTML = '<div role="dialog" data-state="closed"></div>';
    expect(isOverlayOpen()).toBe(false);
  });
});
