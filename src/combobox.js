/**
 * An accessible autocomplete on a text input (ARIA 1.2 combobox, list popup).
 *
 *   combobox(input, listbox, { search, onPick })
 *
 *   search(text, signal)  Promise<[{ label, ... }]>: the suggestions for a
 *                         text; `signal` aborts a request gone stale.
 *   onPick(item)          one was chosen, by click, tap or Enter.
 *
 * Typing waits 250 ms of quiet and three characters before asking, and every
 * new keystroke aborts the request still in flight, so a slow answer to "12
 * ru" can never overwrite the one to "12 rue de Rennes". Arrow keys move
 * through the list, Enter picks, Escape closes; focus stays in the input
 * throughout (aria-activedescendant).
 */

import { esc } from "./html.js";

export function combobox(input, listbox, { search, onPick, delay = 250, minChars = 3 }) {
  let items = [];
  let active = -1;
  let timer = null;
  let controller = null;

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", listbox.id);
  input.setAttribute("aria-expanded", "false");
  listbox.setAttribute("role", "listbox");

  function show(list) {
    items = list;
    active = -1;
    listbox.innerHTML = items
      .map((item, i) => `<li role="option" id="${listbox.id}-${i}" aria-selected="false" data-option="${i}">${esc(item.label)}</li>`)
      .join("");
    listbox.hidden = !items.length;
    input.setAttribute("aria-expanded", String(Boolean(items.length)));
    input.removeAttribute("aria-activedescendant");
  }

  function close() {
    clearTimeout(timer);
    controller?.abort();
    show([]);
  }

  function move(step) {
    if (!items.length) return;
    active = (active + step + items.length) % items.length;
    listbox.querySelectorAll("[role=option]").forEach((el, i) => el.setAttribute("aria-selected", String(i === active)));
    input.setAttribute("aria-activedescendant", `${listbox.id}-${active}`);
    listbox.children[active].scrollIntoView({ block: "nearest" });
  }

  function pick(i) {
    const item = items[i];
    close();
    if (item) onPick(item);
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    controller?.abort();
    const text = input.value.trim();
    if (text.length < minChars) return show([]);
    timer = setTimeout(async () => {
      controller = new AbortController();
      const { signal } = controller;
      try {
        const list = await search(text, signal);
        if (!signal.aborted) show(list);
      } catch {
        if (!signal.aborted) show([]); // a failed suggestion is no suggestion
      }
    }, delay);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape" && items.length) {
      e.preventDefault();
      close();
    }
  });

  // mousedown, not click: picking must not blur the input first.
  listbox.addEventListener("mousedown", (e) => {
    const el = e.target.closest("[data-option]");
    if (!el) return;
    e.preventDefault();
    pick(Number(el.dataset.option));
  });

  input.addEventListener("blur", close);

  return { close };
}
