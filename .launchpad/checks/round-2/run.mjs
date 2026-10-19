// Round 2's checks: the themes and the leaderboard (the round's brief has the interface). Round 1's
// checks run too: the gate runs every earlier round's. They run the entry's `node card.mjs` with the
// check kit (lib/) and write {"tests":[{"name","status"}]} to $LAUNCHPAD_GATE_OUT for the gate.
// Run them yourself from the repository's root: node .launchpad/checks/round-2/run.mjs
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check, harness } from "./lib/harness.mjs";
import { ROOT, input, refuses } from "./lib/entry.mjs";
import { TOP, byRank, card, cardTitle, drawing, grouped, inOrder, numbersShown, render, section, themeOf, titleOf, topTitle, visibleText } from "./cards.mjs";

const { test, done } = harness();
const SAMPLE = { name: "opus-a", owner: "Cheelax", points: 4_200_000, wins: 2, rounds: 5 };

// Twelve agents, with ties on points and on points and wins; names no other name contains.
const FIELD = [
  { name: "ada-7", points: 9_000, wins: 3, rounds: 4 },
  { name: "bea-3", points: 12_500, wins: 5, rounds: 6 },
  { name: "cyd-5", points: 9_000, wins: 4, rounds: 4 },
  { name: "dot-2", points: 300, wins: 0, rounds: 2 },
  { name: "eve-9", points: 9_000, wins: 3, rounds: 5 },
  { name: "fay-4", points: 75_000, wins: 9, rounds: 9 },
  { name: "gus-6", points: 0, wins: 0, rounds: 1 },
  { name: "hal-1", points: 4_200, wins: 1, rounds: 3 },
  { name: "ivy-8", points: 1_000_000, wins: 12, rounds: 14 },
  { name: "joe-0", points: 50, wins: 0, rounds: 1 },
  { name: "kit-5", points: 600, wins: 1, rounds: 1 },
  { name: "lou-3", points: 9_000, wins: 4, rounds: 7 },
];

await test("--theme light is the default", async () => {
  const path = input(SAMPLE);
  const plain = await render([path]);
  const light = await render([path, "--theme", "light"]);
  check(themeOf(plain.root) === "light", `the root's data-theme is ${JSON.stringify(themeOf(plain.root))} without --theme, expected "light"`);
  check(plain.svg === light.svg, "the card without --theme differs from --theme light");
});

await test("--theme dark prints a different valid card, with the same title", async () => {
  const path = input(SAMPLE);
  const light = await render([path, "--theme", "light"]);
  const dark = await render([path, "--theme", "dark"]);
  check(themeOf(dark.root) === "dark", `the root's data-theme is ${JSON.stringify(themeOf(dark.root))}, expected "dark"`);
  check(drawing(dark.root) !== drawing(light.root), "the dark card is drawn like the light one: only its data-theme differs");
  check(titleOf(dark.root) === cardTitle(SAMPLE), `the dark card's title is "${titleOf(dark.root)}", expected "${cardTitle(SAMPLE)}"`);
  check((await render(["--theme", "dark", path])).svg === dark.svg, "--theme before the file gives another card than after it");
  const odd = { name: `Tom & <Jerry> "Q" 'x'`, points: 10, wins: 0, rounds: 2 };
  const { root } = await render([input(odd), "--theme", "dark"]);
  check(visibleText(root).includes(odd.name), "the dark card does not show a name with markup as given");
});

await test("an unknown or missing theme is refused", async () => {
  const path = input(SAMPLE);
  const list = input(FIELD);
  // A card that refuses every theme does not pass this one.
  await render([path, "--theme", "dark"]);
  await render(["--top", list, "--theme", "dark"], TOP);
  await refuses(card, [path, "--theme", "blue"], "--theme blue");
  await refuses(card, [path, "--theme"], "--theme with no value");
  await refuses(card, ["--top", list, "--theme", "blue"], "--top with --theme blue");
  await refuses(card, ["--top", list, "--theme"], "--top with --theme and no value");
});

await test("examples/agent-dark.svg is the dark card of examples/agent.json", async () => {
  check(existsSync(join(ROOT, "examples/agent-dark.svg")), "examples/agent-dark.svg is not committed");
  const { svg } = await render(["examples/agent.json", "--theme", "dark"]);
  check(readFileSync(join(ROOT, "examples/agent-dark.svg"), "utf8") === svg, "examples/agent-dark.svg differs from node card.mjs examples/agent.json --theme dark");
});

await test("--top shows the ten best, by points, then wins, then name, in a card at most 600×900 px and 48 KB", async () => {
  const { root } = await render(["--top", input(FIELD)], TOP);
  const ranked = [...FIELD].sort(byRank);
  check(titleOf(root) === topTitle(10), `the title is "${titleOf(root)}", expected "${topTitle(10)}"`);
  inOrder(root, ranked.slice(0, 10).map((a) => a.name));
  const shown = visibleText(root);
  for (const a of ranked.slice(10)) check(!shown.includes(a.name), `${a.name} is 11th or below but on the card`);
});

await test("names with equal points and wins go A to Z by code point: capitals first, accents after z", async () => {
  // By code point: "Zed" (Z is U+005A) < "abe" < "zoë" < "Émile" (U+00C9) < "Ünal" (U+00DC). A
  // locale's order (abe, Émile, Ünal, Zed, zoë) is not the brief's.
  const tied = ["Ünal", "abe", "Émile", "Zed", "zoë"].map((name) => ({ name, points: 500, wins: 2, rounds: 3 }));
  const field = [...tied, { name: "leader", points: 900, wins: 1, rounds: 1 }];
  const { root } = await render(["--top", input(field)], TOP);
  inOrder(root, ["leader", "Zed", "abe", "zoë", "Émile", "Ünal"]);
});

await test("each row shows its rank, its name and its points with commas", async () => {
  // Names without digits, and wins, rounds and win rates of 11 or more: apart from a "Top 10" heading,
  // the numbers 1 to 10 on the card are ranks.
  const names = ["juliett", "alpha", "kilo", "delta", "hotel", "bravo", "lima", "foxtrot", "charlie", "india", "echo", "golf"];
  const points = [50, 1_234_567, 0, 9_000, 999, 75_000, 0, 4_200, 12_500, 600, 9_000, 1_000];
  const field = names.map((name, i) => ({ name, points: points[i], wins: 11 + (i % 3), rounds: 20 + i }));
  const ranked = [...field].sort(byRank);
  const { root } = await render(["--top", input(field)], TOP);
  inOrder(root, ranked.slice(0, 10).map((a) => a.name));
  const numbers = numbersShown(root, /\btop\s+\d/i);
  for (let rank = 1; rank <= 10; rank++) {
    check(numbers.some((n) => Number(n.replaceAll(",", "")) === rank), `rank ${rank} is not on the card (numbers shown: ${numbers.join(" ")})`);
  }
  for (const a of ranked.slice(0, 10)) {
    const want = ranked.slice(0, 10).filter((b) => b.points === a.points).length;
    const got = numbers.filter((n) => n === grouped(a.points)).length;
    check(got >= want, `${a.name}'s points, ${grouped(a.points)}, are shown ${got} times, expected ${want} (numbers shown: ${numbers.join(" ")})`);
  }
});

await test("--top with fewer than ten shows them all: Top 1 agent, Top 3 agents, No agents yet", async () => {
  for (const n of [1, 3, 0]) {
    const field = FIELD.slice(0, n);
    const { root } = await render(["--top", input(field)], TOP);
    check(titleOf(root) === topTitle(n), `with ${n}, the title is "${titleOf(root)}", expected "${topTitle(n)}"`);
    for (const a of field) check(visibleText(root).includes(a.name), `${a.name} is not on the card`);
  }
});

await test("--top keeps round 1's rules: markup escaped, non-ASCII names kept, 40-character names shown", async () => {
  const long = ["an-agent-with-a-very-long-name-indeed-40", "zz-another-agent-with-forty-characters-x"];
  for (const name of long) check([...name].length === 40, `fixture: ${name} must be 40 characters`);
  const field = [
    { name: `Tom & <Jerry> "Q" 'x'`, points: 400, wins: 1, rounds: 2 },
    { name: "Zoë · 机器人 🤖", owner: "zoe-bot", points: 300, wins: 1, rounds: 3 },
    { name: long[0], points: 200, wins: 0, rounds: 1 },
    { name: long[1], points: 100, wins: 0, rounds: 1 },
  ];
  for (const theme of ["light", "dark"]) {
    const { root } = await render(["--top", input(field), "--theme", theme], TOP);
    check(titleOf(root) === topTitle(4), `the ${theme} title is "${titleOf(root)}", expected "${topTitle(4)}"`);
    const shown = visibleText(root);
    for (const name of [field[0].name, field[1].name]) check(shown.includes(name), `the ${theme} leaderboard does not show ${name} as given`);
    for (const name of long) check(shown.includes(name.slice(0, 16)), `the ${theme} leaderboard does not show "${name.slice(0, 16)}", the first 16 characters of a 40-character name`);
  }
});

await test("--top takes --theme, in any order", async () => {
  const path = input(FIELD);
  const light = await render(["--top", path], TOP);
  const dark = await render(["--top", path, "--theme", "dark"], TOP);
  check(themeOf(light.root) === "light", `the leaderboard's data-theme is ${JSON.stringify(themeOf(light.root))} by default, expected "light"`);
  check((await render(["--top", path, "--theme", "light"], TOP)).svg === light.svg, "--top with --theme light differs from --top alone");
  check(themeOf(dark.root) === "dark", `the dark leaderboard's data-theme is ${JSON.stringify(themeOf(dark.root))}, expected "dark"`);
  check(drawing(dark.root) !== drawing(light.root), "the dark leaderboard is drawn like the light one: only its data-theme differs");
  check(titleOf(dark.root) === topTitle(10), `the dark leaderboard's title is "${titleOf(dark.root)}", expected "${topTitle(10)}"`);
  check((await render(["--theme", "dark", "--top", path], TOP)).svg === dark.svg, "--theme before --top gives another card than after it");
});

await test("--top refuses a file that is not a list, or a list with a bad agent anywhere in it", async () => {
  // A card that refuses every list does not pass this one.
  await render(["--top", input(FIELD)], TOP);
  await refuses(card, ["--top"], "--top with no file");
  await refuses(card, ["--top", join(ROOT, "no-such-file.json")], "--top with a missing file");
  await refuses(card, ["--top", input("[ not json")], "invalid JSON");
  await refuses(card, ["--top", input(SAMPLE)], "an object instead of a list");
  await refuses(card, ["--top", input({ agents: FIELD })], "a list inside an object");
  for (const [what, v] of [["null", null], ["a number", 7], ["a list", [SAMPLE]]]) {
    await refuses(card, ["--top", input([...FIELD, v])], `a list holding ${what} instead of an agent`);
  }
  // Each bad agent comes after twelve good ones: below the top ten, it is still bad input.
  const ok = { name: "ok", points: 0, wins: 0, rounds: 0 };
  const bad = {
    "no name": { ...ok, name: undefined },
    "a blank name": { ...ok, name: "   " },
    "a 41-character name": { ...ok, name: "x".repeat(41) },
    "a name that is a number": { ...ok, name: 42 },
    "negative points": { ...ok, points: -1 },
    "fractional points": { ...ok, points: 1.5 },
    "points as a string": { ...ok, points: "12" },
    "no rounds": { ...ok, rounds: undefined },
    "more wins than rounds": { ...ok, wins: 3, rounds: 2 },
    "an owner that is not a GitHub login": { ...ok, owner: "not a login!" },
    "a 40-character owner": { ...ok, owner: "o".repeat(40) },
  };
  for (const [what, a] of Object.entries(bad)) await refuses(card, ["--top", input([...FIELD, a])], `a list with ${what}`);
});

await test("the same list gives the same bytes", async () => {
  const path = input(FIELD);
  check((await render(["--top", path], TOP)).svg === (await render(["--top", path], TOP)).svg, "two runs on the same list printed different cards");
});

await test("examples/top.svg is the leaderboard of examples/top.json", async () => {
  check(existsSync(join(ROOT, "examples/top.svg")), "examples/top.svg is not committed");
  const { svg } = await render(["--top", "examples/top.json"], TOP);
  check(readFileSync(join(ROOT, "examples/top.svg"), "utf8") === svg, "examples/top.svg differs from node card.mjs --top examples/top.json");
});

await test("the README's Usage section shows --theme and --top", () => {
  const readme = existsSync(join(ROOT, "README.md")) ? readFileSync(join(ROOT, "README.md"), "utf8") : "";
  const usage = section(readme, "Usage");
  check(usage !== null, "README.md has no \"Usage\" heading");
  for (const flag of ["--theme", "--top"]) check(usage.includes(flag), `the README's Usage section does not mention ${flag}`);
});

// Not a check of its own: a card that cannot even start says why once, above the failures.
if (!existsSync(join(ROOT, "card.mjs"))) console.error("note: there is no card.mjs, so every check fails");
else if ((await card([input(SAMPLE)]).catch(() => ({ code: null }))).code !== 0) console.error("note: node card.mjs fails on the sample input, so most checks fail");

done();
