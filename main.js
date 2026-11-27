/**
 * Boot: wire the controls, keep the group, rank the places, draw it all.
 *
 * No framework. The state is a handful of values — the group, the settings,
 * the ranking, the place picked — and `render()` redraws the panel from them.
 * The map is told what changed. Travel times come from travel.js only, so its
 * method can change without this file noticing.
 */

// Self-hosted: Google Fonts would send every visitor's IP address to a third
// party. Browsers fetch only the latin file, through unicode-range.
import "@fontsource-variable/manrope/wght.css";
import "./app.css";

import { initI18n, setLang, getLang, onLangChange, t } from "./src/i18n.js";
import { geocode, lookup } from "./src/geocode.js";
import { combobox } from "./src/combobox.js";
import { loadTravelData, travelTimes, searchArea, meetingZone } from "./src/travel.js";
import { placesIn } from "./src/venues.js";
import { rank, blocker } from "./src/score.js";
import { encodeSession, decodeSession, sanitizeLimit, MAX_PARTICIPANTS, LIMIT_RANGE } from "./src/session.js";
import { loadGroup, saveGroup, loadPrefs, savePrefs } from "./src/store.js";
import { esc, safeUrl, minutes } from "./src/html.js";
import { directionsUrl, osmUrl, searchUrl } from "./src/links.js";
import { initMap, showGroup, showArea, showBars, showTrips, showZone, frame } from "./src/map.js";

const $ = (sel) => document.querySelector(sel);
const PAGE = 5;
const MAX_SHOWN_FOR_PICK = 25;

const state = {
  group: [],
  weight: 0.85, // proximity share of the BaryScore
  categories: ["bar"],
  zone: null, // minutes, or null for no meeting zone
  ranking: null, // null: not searched; [] searched, nothing passed
  blocked: null, // when nothing passed: { who, why } — who rules out the most, "reach" or "limit"
  shown: PAGE,
  picked: -1,
  busy: false,
  error: null,
};

// ------------------------------------------------------------------ group

/** Any change to the group or the settings voids the ranking. */
function reset() {
  state.ranking = null;
  state.picked = -1;
  state.error = null;
  showArea(null);
  showZone(null);
  showBars([], () => {});
  showTrips(state.group, null, -1);
}

function setGroup(group) {
  const again = rerun();
  state.group = group;
  saveGroup(group);
  reset();
  showGroup(group);
  frame(group);
  render();
  again();
}

function setSettings(patch) {
  const again = rerun();
  Object.assign(state, patch);
  savePrefs({ weight: state.weight, categories: state.categories });
  reset();
  render();
  again();
}

/**
 * Once a ranking is on screen, a change re-ranks at once (the data is already
 * loaded) and keeps the place that was open, if it is still in.
 */
function rerun() {
  if (!state.ranking) return () => {};
  const id = state.ranking[state.picked]?.id ?? null;
  return () => search(id);
}

// A suggestion picked from the list, kept until the person is added: it
// already carries its coordinates, so nothing is geocoded twice.
let chosen = null;

/** Add a person at a resolved place; asks for a name first if there is none. */
function addAt(place) {
  const name = $("#name").value.trim();
  if (state.group.length >= MAX_PARTICIPANTS) return message(t("group.full", { n: MAX_PARTICIPANTS }));
  if (!name) {
    chosen = place;
    $("#address").value = place.label;
    message(t("group.needName"));
    return $("#name").focus();
  }
  const mode = document.querySelector('input[name="mode"]:checked').value;
  setGroup([...state.group, { name, label: place.label, lat: place.lat, lng: place.lng, mode, max: null }]);
  chosen = null;
  $("#name").value = "";
  $("#address").value = "";
  message("");
  $("#name").focus();
}

async function addPerson(e) {
  e.preventDefault();
  const query = $("#address").value.trim();
  if (!$("#name").value.trim() || !query) return;
  if (chosen?.label === query) return addAt(chosen);
  const button = $("#addBtn");
  button.disabled = true;
  button.textContent = t("group.adding");
  try {
    addAt(await geocode(query));
  } catch {
    message(t("group.notFound", { q: query }));
  } finally {
    button.disabled = false;
    button.textContent = t("group.add");
  }
}

const message = (text) => ($("#formMsg").textContent = text);

// ------------------------------------------------------------------ search

/** Rank the places; `venueId` re-opens a place (from a share link). */
async function search(venueId = null) {
  if (state.group.length < 2 || state.busy) return;
  state.busy = true;
  state.error = null;
  render();
  try {
    // The mesh tiles around the group, then the venue tiles around the best
    // meeting point, of the categories asked for: two rounds of HTTP range
    // requests into the PMTiles archives, never a whole file.
    // Each step leaves a measure (search:mesh, :area, :venues, :rank) so what
    // a search costs can be read in the browser's performance timeline.
    const step = (name, from) => performance.measure(`search:${name}`, from);
    performance.mark("s0");
    await loadTravelData(state.group);
    step("mesh", "s0");
    performance.mark("s1");
    const area = searchArea(state.group);
    step("area", "s1");
    performance.mark("s2");
    const candidates = await placesIn(area, state.categories);
    step("venues", "s2");
    performance.mark("s3");
    const times = travelTimes(state.group, candidates);
    const limits = state.group.map((p) => p.max);
    state.ranking = rank(candidates, times, { weight: state.weight, limits });
    state.blocked = candidates.length && !state.ranking.length ? blocker(times, limits) : null;
    step("rank", "s3");
    showArea(area);
    drawZone();
    // The place asked for stays open if it is still near the top (a shared
    // link reproduces the same ranking); one that fell far down gives way to
    // the new first, rather than unrolling a hundred pins.
    let wanted = state.ranking.findIndex((v) => v.id === venueId);
    if (wanted >= MAX_SHOWN_FOR_PICK) wanted = -1;
    state.shown = Math.max(PAGE, wanted + 1);
    pick(wanted >= 0 ? wanted : state.ranking.length ? 0 : -1, { fit: true });
  } catch (error) {
    // The cause (network, HTTP status, parsing) is for the console; the
    // visitor gets a translated message.
    console.error(error);
    state.error = true;
  } finally {
    state.busy = false;
    render();
  }
}

function drawZone() {
  showZone(state.zone && state.ranking ? meetingZone(state.group, state.zone) : null);
}

function pick(index, { fit = false } = {}) {
  state.picked = index;
  const venue = state.ranking?.[index] ?? null;
  showBars(state.ranking?.slice(0, state.shown) ?? [], (i) => pick(i, { fit: true }));
  showTrips(state.group, venue, index);
  if (venue && fit) frame([...state.group, venue]);
  render();
  document.querySelector(`[data-pick="${index}"]`)?.scrollIntoView({ block: "nearest" });
}

// ------------------------------------------------------------------ render

function groupHTML() {
  if (!state.group.length) return `<li class="text-sm text-soft">${t("group.empty")}</li>`;
  return state.group
    .map(
      (p, i) => `
      <li class="flex items-center gap-2">
        <span class="num">${i + 1}</span>
        <div class="min-w-0 flex-1">
          <div class="truncate font-medium">${esc(p.name)}</div>
          <div class="truncate text-xs text-faint">${esc(p.label)}</div>
        </div>
        <select class="field w-auto! px-2! py-1! text-sm!" data-mode="${i}" aria-label="${esc(t("group.modeFor", { name: p.name }))}">
          ${["car", "bike", "foot"].map((m) => `<option value="${m}" ${m === p.mode ? "selected" : ""}>${t(`mode.${m}`)}</option>`).join("")}
        </select>
        <input type="number" inputmode="numeric" class="field limit w-14! px-2! py-1! text-sm! tnum" data-max="${i}"
          min="${LIMIT_RANGE[0]}" max="${LIMIT_RANGE[1]}" step="5" value="${p.max ?? ""}"
          placeholder="${t("limit.placeholder")}" title="${esc(t("limit.title"))}" aria-label="${esc(t("limit.for", { name: p.name }))}">
        <button class="lang-btn text-base" data-remove="${i}" aria-label="${esc(t("group.remove", { name: p.name }))}">✕</button>
      </li>`,
    )
    .join("");
}

function gapHTML(gap) {
  if (gap < -1) return `<span class="ahead">${t("results.gap.ahead")} ${Math.round(-gap)}</span>`;
  if (gap > 1) return `<span class="behind">${t("results.gap.behind")} +${Math.round(gap)}</span>`;
  return `<span class="text-faint">${t("results.gap.even")}</span>`;
}

function venueHTML(v, i) {
  const picked = i === state.picked;
  const site = safeUrl(v.website);
  const details = picked
    ? `<div class="space-y-3 px-4 pb-4 pl-12">
        <ul class="space-y-1.5 text-sm">
          ${state.group
            .map(
              (p, k) => `<li class="flex items-center gap-2">
                <span class="num">${k + 1}</span>
                <span class="min-w-0 flex-1 truncate">${esc(p.name)}</span>
                <span class="text-xs tnum">${gapHTML(v.gaps[k])}</span>
                <strong class="w-14 text-right tnum">${minutes(v.minutes[k])}</strong>
                <a class="text-faint hover:text-text" href="${esc(directionsUrl(p, v, p.mode))}" target="_blank" rel="noopener noreferrer" title="${t("results.directions")} (Google Maps)" aria-label="${t("results.directions")} ${esc(p.name)}">↗</a>
              </li>`,
            )
            .join("")}
        </ul>
        ${v.hours ? `<p class="text-xs text-faint">${t("results.hours")} : ${esc(v.hours)}</p>` : ""}
        <div class="flex flex-wrap gap-1.5">
          ${site ? `<a class="chip" href="${esc(site)}" target="_blank" rel="noopener noreferrer">${t("results.website")}</a>` : ""}
          ${v.phone ? `<a class="chip" href="tel:${esc(v.phone.replace(/[^\d+]/g, ""))}">${esc(v.phone)}</a>` : ""}
          <a class="chip" href="${esc(searchUrl(v))}" target="_blank" rel="noopener noreferrer">Google Maps</a>
          ${osmUrl(v.osmId) ? `<a class="chip" href="${esc(osmUrl(v.osmId))}" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>` : ""}
        </div>
      </div>`
    : "";
  return `
    <li class="result ${picked ? "is-picked" : ""}">
      <button class="flex items-start gap-3 px-4 py-3" data-pick="${i}" aria-expanded="${picked}">
        <span class="num mt-0.5 ${picked ? "bg-primary!" : ""}">${i + 1}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold">${esc(v.name ?? t(`cat.unnamed.${v.category}`))}</span>
          <span class="block truncate text-xs text-faint">${state.categories.length > 1 ? `${t(`cat.${v.category}`)} · ` : ""}${esc(v.address ?? "")}</span>
          <span class="mt-1 block text-xs text-soft tnum">${t("results.mean", { min: minutes(v.mean), max: minutes(v.max) })}</span>
        </span>
        <span class="score" title="BaryScore">${v.score}</span>
      </button>
      ${details}
    </li>`;
}

function resultsHTML() {
  const note = (text, tone = "text-soft") => `<p class="px-4 py-4 text-sm ${tone}">${text}</p>`;
  if (state.error) return note(esc(t("error.data")), "text-behind");
  if (state.busy) return note(t("search.loading"));
  if (!state.ranking) return "";
  if (!state.ranking.length) {
    const { who, why } = state.blocked ?? {};
    if (who >= 0) {
      const p = state.group[who];
      // Out of reach names the mode and what to try instead; a limit names
      // the person whose limit to relax.
      const key = why === "reach" ? `search.reach.${p.mode}` : "search.limited";
      return note(esc(t(key, { name: p.name })), "text-behind");
    }
    return note(t("search.none"));
  }
  const rest = state.ranking.length - state.shown;
  return `
    <div class="flex items-center justify-between px-4 pt-4 pb-2">
      <h2 class="text-sm font-semibold tracking-wide text-soft uppercase">${t("results.title", { n: state.ranking.length })}</h2>
      <button class="chip" id="share">${t("results.share")}</button>
    </div>
    <ol>${state.ranking.slice(0, state.shown).map(venueHTML).join("")}</ol>
    ${rest > 0 ? `<div class="p-4"><button class="btn w-full" id="more">${t("results.more", { n: Math.min(rest, 10) })}</button></div>` : ""}`;
}

function render() {
  $("#group").innerHTML = groupHTML();
  $("#results").innerHTML = resultsHTML();
  document.querySelectorAll('input[name="category"]').forEach((el) => (el.checked = state.categories.includes(el.value)));
  $("#weight").value = Math.round(state.weight * 100);
  $("#weightOut").textContent = `${Math.round(state.weight * 100)} / ${Math.round((1 - state.weight) * 100)}`;
  $("#zone").value = state.zone ?? "";
  const go = $("#go");
  go.disabled = state.group.length < 2 || state.busy;
  go.title = state.group.length < 2 ? t("search.need") : "";
  document.querySelectorAll(".lang-btn[data-lang]").forEach((b) => b.classList.toggle("is-active", b.dataset.lang === getLang()));
}

// ------------------------------------------------------------------ share

function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.style.opacity = "1";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.style.opacity = "0"), 2500);
}

/**
 * The link carries the group, the settings and the place picked. On a phone
 * the system share sheet; elsewhere, or if it is unavailable, the clipboard.
 */
async function share() {
  const url = new URL(location.href);
  url.search = `?s=${encodeSession({
    group: state.group,
    weight: state.weight,
    categories: state.categories,
    venue: state.ranking?.[state.picked]?.id,
  })}`;
  history.replaceState(null, "", url);
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      return await navigator.share({ title: "Barycadabra", text: t("share.text"), url: url.href });
    } catch (error) {
      if (error.name === "AbortError") return; // the person closed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url.href);
    toast(t("results.copied"));
  } catch {
    toast(t("results.copyFailed"));
  }
}

// ------------------------------------------------------------------ boot

initI18n();

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-pick], [data-remove], [data-lang], #more, #share, #go");
  if (!el) return;
  if (el.dataset.pick) pick(Number(el.dataset.pick) === state.picked ? -1 : Number(el.dataset.pick), { fit: true });
  else if (el.dataset.remove) setGroup(state.group.filter((_, i) => i !== Number(el.dataset.remove)));
  else if (el.dataset.lang) setLang(el.dataset.lang);
  else if (el.id === "more") { state.shown += 10; pick(state.picked); }
  else if (el.id === "share") share();
  else if (el.id === "go") search();
});

document.addEventListener("change", (e) => {
  const { mode, max } = e.target.dataset ?? {};
  if (mode != null) setGroup(state.group.map((p, k) => (k === Number(mode) ? { ...p, mode: e.target.value } : p)));
  else if (max != null) setGroup(state.group.map((p, k) => (k === Number(max) ? { ...p, max: sanitizeLimit(e.target.value) } : p)));
  else if (e.target.name === "category") {
    const categories = [...document.querySelectorAll('input[name="category"]:checked')].map((el) => el.value);
    if (categories.length) setSettings({ categories });
    else e.target.checked = true; // at least one kind of place
  } else if (e.target.id === "weight") setSettings({ weight: Number(e.target.value) / 100 });
  else if (e.target.id === "zone") {
    state.zone = e.target.value ? Number(e.target.value) : null;
    drawZone();
  }
});

// The figures follow the slider while it moves; the ranking waits for release.
$("#weight").addEventListener("input", (e) => {
  const w = Number(e.target.value);
  $("#weightOut").textContent = `${w} / ${100 - w}`;
});

$("#addForm").addEventListener("submit", addPerson);
combobox($("#address"), $("#suggestions"), {
  search: (text, signal) => lookup(text, { autocomplete: true, signal }),
  onPick: addAt,
});
onLangChange(render);

// Infos: a native dialog, so focus and Escape come for free.
const infos = $("#infos");
$("#infosBtn").addEventListener("click", () => infos.showModal());
infos.addEventListener("click", (e) => {
  // The close button, or a click on the backdrop (outside the box).
  if (e.target.closest("[data-close]") || e.target === infos) infos.close();
});

// A shared link wins over what this browser remembered, and runs the search.
const token = new URLSearchParams(location.search).get("s");
const shared = token ? decodeSession(token) : null;
Object.assign(state, loadPrefs());
if (shared?.group.length) Object.assign(state, { group: shared.group, weight: shared.weight, categories: shared.categories });
else state.group = loadGroup();
render();

// Without WebGL there is no map, but the ranking still works.
initMap($("#map")).catch((error) => console.error("map:", error)).finally(() => {
  setGroup(state.group);
  if (shared?.group.length) {
    toast(t("imported"));
    search(shared.venue);
  }
});
