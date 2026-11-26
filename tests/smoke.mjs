/**
 * What no unit test sees: does the application run in a real browser?
 *
 * It opens a share link for a group of three in Rennes, waits for the ranking,
 * opens a bar, switches language, shares (clipboard on desktop, a stubbed
 * system share sheet on the phone) and re-opens the link on the same place,
 * moves the weight, sets impossible time limits, draws the meeting zone, opens
 * Infos, then adds a fourth person through the address autocomplete —
 * keyboard only — and does it all again at phone width. The geocoder is
 * answered by request interception: no network for it, and a known answer.
 *
 * Skips itself cleanly when puppeteer-core or Chrome is absent: a useful
 * check, not a gate.
 *
 *   pnpm build && pnpm preview &
 *   pnpm test:smoke
 *
 * With a local copy of the data (VITE_CDN at build time, same value here):
 *
 *   pnpm exec vite preview --config /dev/null --outDir .cdn-local --port 4000 &
 *   VITE_CDN=http://localhost:4000 pnpm build && pnpm preview &
 *   VITE_CDN=http://localhost:4000 pnpm test:smoke
 *
 * SHOTS=<dir> saves a screenshot per viewport.
 */

import { encodeSession, decodeSession } from "../src/session.js";

const URL = process.env.SMOKE_URL || "http://localhost:4173/barycadabra/";
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome-stable";
const SHOTS = process.env.SHOTS;

const group = [
  { name: "Zoé", label: "Place Sainte-Anne, Rennes", lat: 48.11469, lng: -1.68034, mode: "bike", max: null },
  { name: "Léo", label: "Gare de Rennes", lat: 48.10353, lng: -1.67228, mode: "foot" },
  { name: "Inès", label: "Cesson-Sévigné", lat: 48.1213, lng: -1.6036, mode: "car" },
];

let puppeteer;
try {
  puppeteer = (await import("puppeteer-core")).default;
} catch {
  console.log("skip: puppeteer-core is not installed");
  process.exit(0);
}
const { existsSync } = await import("node:fs");
if (!existsSync(CHROME)) {
  console.log(`skip: no Chrome at ${CHROME}`);
  process.exit(0);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  // Headless Chrome has no GPU; without this MapLibre cannot get a context.
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"],
});

const problems = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) problems.push(what);
};

async function run(width, height, label, mobile = false) {
  const page = await browser.newPage();
  // A phone: touch, so `pointer: coarse` and the system share sheet, stubbed.
  await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile });
  if (mobile) {
    await page.evaluateOnNewDocument(() => {
      navigator.share = async (data) => {
        window.__shared = data;
      };
    });
  } else {
    const origin = new globalThis.URL(URL).origin;
    await browser.defaultBrowserContext().overridePermissions(origin, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
  }
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  // The geocoder is answered here, so the autocomplete check needs no network
  // and knows what it should get. Everything else goes through.
  let geocoderCalls = 0;
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (!req.url().startsWith("https://data.geopf.fr/geocodage/")) return req.continue();
    geocoderCalls++;
    const feature = (label, lng, lat) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { label } });
    req.respond({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        type: "FeatureCollection",
        features: [feature("12 Rue de Rennes 35510 Cesson-Sévigné", -1.612659, 48.11493), feature("12 Rue de Rennes 53000 Laval", -0.776764, 48.070115)],
      }),
    });
  });

  await page.goto(`${URL}?s=${encodeSession({ group, weight: 0.85, categories: ["bar"] })}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-pick]", { timeout: 60000 }).catch(() => {});

  const people = await page.$$eval("#group > li .num", (els) => els.length);
  check(people === 3, `${label}: the shared group is loaded (${people})`);

  const results = await page.$$eval("[data-pick]", (els) => els.length);
  check(results > 0, `${label}: bars are ranked (${results} shown)${results ? "" : ` — ${await page.$eval("#results", (el) => el.textContent.trim())}`}`);

  const first = await page.$eval(".result.is-picked", (el) => ({
    score: Number(el.querySelector(".score")?.textContent),
    trips: el.querySelectorAll(":scope ul .num").length,
  })).catch(() => null);
  check(first && first.score >= 1 && first.score <= 100, `${label}: first bar scored ${first?.score}`);
  check(first?.trips === 3, `${label}: one trip per person in the open bar`);

  const pins = await page.$$eval(".pin-bar", (els) => els.length);
  check(pins === results, `${label}: one pin per ranked bar on the map`);
  const canvas = await page.$(".maplibregl-canvas");
  check(Boolean(canvas), `${label}: the map is drawn`);

  await page.click('[data-pick="1"]');
  const second = await page.$eval(".result.is-picked [data-pick]", (el) => el.dataset.pick).catch(() => null);
  check(second === "1", `${label}: picking another bar opens it`);

  await page.click('.lang-btn[data-lang="en"]');
  const go = await page.$eval("#go", (el) => el.textContent);
  check(go === "Find the place", `${label}: English labels (${go})`);
  await page.click('.lang-btn[data-lang="fr"]');

  // ---- Share: the link carries the place picked, and re-opens it
  const pickedName = await page.$eval(".result.is-picked .font-semibold", (el) => el.textContent);
  await page.click("#share");
  await page.waitForFunction(() => new URLSearchParams(location.search).has("s"), { timeout: 5000 }).catch(() => {});
  const link = await page.evaluate(() => location.href);
  const sent = decodeSession(new globalThis.URL(link).searchParams.get("s") ?? "");
  check(sent.group.length === 3 && Boolean(sent.venue), `${label}: share link holds the group and the place (${sent.venue})`);
  if (mobile) {
    const shared = await page.evaluate(() => window.__shared);
    check(shared?.url === link, `${label}: the system share sheet gets the link`);
  } else {
    const toastText = await page.$eval("#toast", (el) => el.textContent);
    check(toastText === "Lien copié", `${label}: link copied (${toastText})`);
  }
  const reopened = await browser.newPage();
  await reopened.setViewport({ width, height });
  await reopened.goto(link, { waitUntil: "domcontentloaded" });
  await reopened.waitForSelector(".result.is-picked", { timeout: 60000 }).catch(() => {});
  const reopenedName = await reopened.$eval(".result.is-picked .font-semibold", (el) => el.textContent).catch(() => null);
  check(reopenedName === pickedName, `${label}: the shared link re-opens ${pickedName} (${reopenedName})`);
  await reopened.close();

  // ---- Settings: categories, weight, a time limit, the zone
  await page.click('.toggle input[value="bar"] + span');
  check(await page.$eval('input[value="bar"]', (el) => el.checked), `${label}: the last category cannot be unticked`);

  await page.$eval("#weight", (el) => {
    el.value = "0";
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForSelector("[data-pick]", { timeout: 10000 }).catch(() => {});
  const weightOut = await page.$eval("#weightOut", (el) => el.textContent);
  check(weightOut === "0 / 100" && (await page.$$("[data-pick]")).length > 0, `${label}: the weight re-ranks at once (${weightOut})`);

  // Léo on foot and Inès by car, both capped at 5 minutes: nothing can pass.
  const setLimit = (who, value) =>
    page.$eval(`[data-max="${who}"]`, (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  await setLimit(1, "5");
  await setLimit(2, "5");
  await page.waitForFunction(() => /restrictive/.test(document.querySelector("#results").textContent), { timeout: 10000 }).catch(() => {});
  const limited = await page.$eval("#results", (el) => el.textContent.trim());
  check(/Léo|Inès/.test(limited) && /restrictive/.test(limited), `${label}: an impossible limit says whose it is`);
  await setLimit(1, "");
  await setLimit(2, "");
  await page.waitForSelector("[data-pick]", { timeout: 10000 }).catch(() => {});
  check((await page.$$("[data-pick]")).length > 0, `${label}: clearing the limits brings the places back`);

  await page.select("#zone", "20");
  await new Promise((r) => setTimeout(r, 500));

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, `${label}: no horizontal scroll`);


  if (SHOTS) {
    await new Promise((r) => setTimeout(r, 1500)); // basemap tiles
    await page.screenshot({ path: `${SHOTS}/${label}.png` });
  }

  // ---- Infos, and the map's attribution
  await page.click("#infosBtn");
  const infos = await page.$eval("#infos", (d) => ({ open: d.open, text: d.textContent }));
  check(infos.open && /OpenStreetMap/.test(infos.text) && /ODbL/.test(infos.text) && /Géoplateforme/.test(infos.text),
    `${label}: Infos opens with the credits`);
  await page.keyboard.press("Escape");
  check(!(await page.$eval("#infos", (d) => d.open)), `${label}: Escape closes Infos`);
  const attribution = await page.$eval(".maplibregl-ctrl-attrib", (el) =>
    el.offsetHeight > 0 && !el.classList.contains("maplibregl-compact") && /OpenStreetMap/.test(el.textContent)).catch(() => false);
  check(attribution, `${label}: map attribution visible`);

  // ---- Autocomplete: debounced, keyboard, pick adds the person
  await page.type("#name", "Max");
  await page.type("#address", "12 rue de renn", { delay: 20 });
  await page.waitForSelector("#suggestions [role=option]", { timeout: 5000 }).catch(() => {});
  const options = await page.$$eval("#suggestions [role=option]", (els) => els.length);
  check(options === 2, `${label}: suggestions listed (${options})`);
  check(geocoderCalls === 1, `${label}: one request for one burst of typing (${geocoderCalls})`);
  check(await page.$eval("#address", (el) => el.getAttribute("aria-expanded")) === "true", `${label}: combobox expanded`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${label}-suggest.png` });

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  const activeId = await page.$eval("#address", (el) => el.getAttribute("aria-activedescendant"));
  check(activeId === "suggestions-0", `${label}: arrows move the active option (${activeId})`);
  await page.keyboard.press("Enter");
  const added = await page.$$eval("#group > li", (els) => els.at(-1)?.textContent ?? "");
  const count = await page.$$eval("#group > li .num", (els) => els.length);
  check(count === 4 && /Max/.test(added) && /Cesson-Sévigné/.test(added), `${label}: Enter adds the person at the suggestion`);

  await page.type("#address", "rue de laval");
  await page.waitForSelector("#suggestions [role=option]", { timeout: 5000 }).catch(() => {});
  await page.keyboard.press("Escape");
  check(await page.$eval("#suggestions", (el) => el.hidden), `${label}: Escape closes the suggestions`);
  check(errors.length === 0, `${label}: no console error${errors.length ? ` (${errors.join(" | ")})` : ""}`);
  await page.close();
}

try {
  await run(1366, 850, "desktop");
  await run(390, 844, "phone", true);
} finally {
  await browser.close();
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s)`);
  process.exit(1);
}
