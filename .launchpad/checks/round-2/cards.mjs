// What round 2's tests share: running the entry's `node card.mjs` with the check kit (lib/) and reading
// the SVG it prints. A card's rules are round 1's (round-1/lib/card.mjs), on the kit's runner and its
// stricter XML parser. The entry's code only ever runs in a child process, never in this one.
import { check } from "./lib/harness.mjs";
import { entry } from "./lib/entry.mjs";
import { localName, parseXml, textOf, walk } from "./lib/xml.mjs";

/** `await card(["examples/agent.json", "--theme", "dark"])` runs `node card.mjs …` at the entry's root. */
export const card = entry("node", ["card.mjs"]);

/** The limits of the leaderboard card (the brief's "Size"); a single card keeps round 1's. */
export const TOP = { maxWidth: 600, maxHeight: 900, maxBytes: 48 * 1024 };

/** Runs the card and returns its output and parsed root, or throws why it is not a valid card. */
export async function render(args, limits) {
  const r = await card(args);
  check(r.code === 0, `${r.cmd} exited with ${r.code ?? r.signal}${r.err.trim() ? `: ${r.err.trim().slice(0, 300)}` : ""}`);
  return { svg: r.out, root: parseCard(r.out, limits) };
}

const SVG_NS = "http://www.w3.org/2000/svg";
const DIMENSION = /^(\d+(\.\d+)?)(px)?$/;
const FORBIDDEN = new Set(["script", "foreignobject", "iframe", "object", "embed", "audio", "video"]);

/**
 * Checks an SVG card: well-formed, an <svg> root in the SVG namespace with a pixel width and height
 * within the limits and a viewBox, small, self-contained (no script, no event attribute, nothing
 * loaded from outside), and no "undefined", "null" or "NaN" in what it shows. Returns the root.
 */
export function parseCard(svg, { maxWidth = 600, maxHeight = 300, maxBytes = 20 * 1024 } = {}) {
  const bytes = Buffer.byteLength(svg);
  check(bytes > 0, "nothing on stdout");
  check(bytes <= maxBytes, `the card is ${bytes} bytes: at most ${maxBytes}`);
  let root;
  try {
    root = parseXml(svg);
  } catch (e) {
    throw new Error(`the card is not well-formed XML: ${e.message}`);
  }
  check(localName(root.name) === "svg", `the root element is <${root.name}>, not <svg>`);
  check(root.attrs.xmlns === SVG_NS, `the root <svg> has no xmlns="${SVG_NS}"`);
  for (const [attr, max] of [["width", maxWidth], ["height", maxHeight]]) {
    const m = DIMENSION.exec(root.attrs[attr] ?? "");
    check(m, `the root's ${attr} is ${JSON.stringify(root.attrs[attr] ?? null)}: it must be a number of pixels`);
    const v = Number(m[1]);
    check(v > 0 && v <= max, `the root's ${attr} is ${v}: more than 0 and at most ${max}`);
  }
  check(/^\s*-?[\d.]+(?:[\s,]+-?[\d.]+){3}\s*$/.test(root.attrs.viewBox ?? ""), "the root <svg> has no viewBox of four numbers");
  for (const el of walk(root)) {
    const name = localName(el.name).toLowerCase();
    check(!FORBIDDEN.has(name), `<${el.name}> is not allowed in a card`);
    for (const [k, v] of Object.entries(el.attrs)) {
      check(!/^on/i.test(localName(k)), `event attribute ${k} on <${el.name}>`);
      if (localName(k) === "href") {
        check(v.startsWith("#") || /^data:image\/(png|jpeg|gif|webp);base64,/.test(v), `<${el.name}> links outside the card: ${k}="${v.slice(0, 60)}"`);
      }
      selfContained(v, `${k} on <${el.name}>`);
    }
    if (name === "style") selfContained(textOf(el), "<style>");
  }
  const shown = visibleText(root);
  for (const word of ["undefined", "null", "NaN"]) check(!new RegExp(`\\b${word}\\b`).test(shown), `the card shows "${word}"`);
  return root;
}

/** Throws if CSS or an attribute value loads something from outside the card. */
function selfContained(text, where) {
  check(!/javascript:/i.test(text), `javascript: in ${where}`);
  check(!/@import/i.test(text), `@import in ${where}`);
  for (const m of text.matchAll(/url\(\s*['"]?([^'")\s]*)/gi)) {
    check(m[1].startsWith("#") || m[1].startsWith("data:"), `${where} loads ${m[1].slice(0, 60)}`);
  }
}

const squash = (s) => s.replace(/\s+/g, " ").trim();
const texts = (root) => [...walk(root)].filter((el) => localName(el.name) === "text");

/** What a reader sees: the text of every <text> element, in document order. */
export const visibleText = (root) => squash(texts(root).map(textOf).join(" "));

/**
 * The numbers a reader sees, as written ("4,200,000", "7"), each text node read apart from its
 * neighbours, leaving out the text nodes that match `skip` (a heading such as "Top 10 agents").
 */
export function numbersShown(root, skip) {
  const pieces = [];
  const leaves = (el) => {
    for (const c of el.children) typeof c === "string" ? pieces.push(c) : leaves(c);
  };
  texts(root).forEach(leaves);
  return pieces.filter((p) => !skip?.test(p)).join(" ").match(/\d+(?:,\d{3})*/g) ?? [];
}

/** The root's <title> child, the card's accessible name. */
export function titleOf(root) {
  const t = root.children.find((c) => typeof c !== "string" && localName(c.name) === "title");
  check(t, "the root <svg> has no <title> child");
  return squash(textOf(t));
}

/** The root's data-theme attribute, or null. */
export const themeOf = (root) => root.attrs["data-theme"] ?? null;

/** The card as drawn: its whole tree without the root's data-theme, so two themes differ by more than their name. */
export function drawing(root) {
  const { "data-theme": _, ...attrs } = root.attrs;
  return JSON.stringify({ ...root, attrs });
}

/** A whole number with commas between thousands: 4200000 is "4,200,000". */
export const grouped = (n) => n.toLocaleString("en-US");
/** "1 point", "0 points", "4,200,000 points". */
export const count = (n, word) => `${grouped(n)} ${word}${n === 1 ? "" : "s"}`;
/** The <title> round 1's brief asks for. */
export const cardTitle = (a) => `${a.name}: ${count(a.points, "point")}, ${count(a.wins, "win")} in ${count(a.rounds, "round")}`;
/** The leaderboard's <title>: "Top 10 agents", "Top 1 agent", "No agents yet". */
export const topTitle = (n) => (n === 0 ? "No agents yet" : `Top ${n} agent${n === 1 ? "" : "s"}`);

/** Compares two strings code point by code point ("Zed" before "abe" before "Émile"). */
export function byCodePoint(a, b) {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d) return d;
  }
  return x.length - y.length;
}
/** The leaderboard's order: points (highest first), then wins (most first), then name by code point. */
export const byRank = (a, b) => b.points - a.points || b.wins - a.wins || byCodePoint(a.name, b.name);

/** Checks that `names` appear in the card's text in this order, each after the one before. */
export function inOrder(root, names) {
  const shown = visibleText(root);
  let at = -1;
  for (const name of names) {
    const i = shown.indexOf(name, at + 1);
    check(shown.includes(name), `${name} is not on the card`);
    check(i > at, `${name} is shown before an agent ranked above it (expected order: ${names.join(", ")})`);
    at = i;
  }
}

/** The body of a Markdown section, from its heading to the next heading of the same level or above, or null. */
export function section(markdown, heading) {
  let level = 0, fenced = false;
  const body = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fenced = !fenced;
    const h = fenced ? null : /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h && level && h[1].length <= level) break;
    if (h && !level && h[2].toLowerCase() === heading.toLowerCase()) {
      level = h[1].length;
      continue;
    }
    if (level) body.push(line);
  }
  return level ? body.join("\n") : null;
}
