#!/usr/bin/env python3
"""Browser check for the Explore shooting views (#shoot, #shoot-predator), with Playwright and Chrome.

Opens each view on a running site, lets a fresh bug live N steps (the view's fastForward hook), and checks:
no console errors or page errors, the bug fires, and consecutive shots are never closer than the cooldown;
the exact cooldown and hit rules are in tools/shoot_check.js. Saves a screenshot of each view mid-shot (and, with the
hunter, while it is stunned).

  python3 tools/explore_shoot_browser_check.py [--base http://127.0.0.1:8099/computelab] [--steps 6000] [--shots DIR]
Exit 0 = all good."""
import argparse, asyncio, json, os, sys
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--base', default='http://127.0.0.1:8099/computelab')
ap.add_argument('--steps', type=int, default=6000)
ap.add_argument('--shots', default='/workspace/explore-shots')
ap.add_argument('--chrome', default='/usr/bin/google-chrome')
A = ap.parse_args()

LIVE = """(n) => { const d = window.ExploreDemos[DEMO], S = window.ExploreArena.SHOOT; let w = d.world(), seen = [], gaps = [];
  for (let i = 0; i < n; i += 50) { d.fastForward(50); const v = d.world(); if (v !== w) { seen.push(w); w = v; } }
  seen.push(w);
  const t = { shots: 0, blocked: 0, red: 0, green: 0, stuns: 0, caught: 0 };
  for (const x of seen) { t.shots += x.shots; t.blocked += x.blocked; t.red += x.redShot; t.green += x.greenShot; t.stuns += x.stuns; t.caught += x.caught;
    for (let k = 1; k < x.shotLog.length; k++) gaps.push(x.shotLog[k] - x.shotLog[k - 1]); }
  t.minGap = gaps.length ? Math.min(...gaps) : null; t.cooldown = S.cooldown; return t; }"""
PICTURE = """(cond) => { const d = window.ExploreDemos[DEMO];
  for (let i = 0; i < 30000; ) { const k = cond === 'stun' ? 10 : 1; d.fastForward(k); i += k; const w = d.world(); if (i > 600 && (cond === 'stun' ? w.predators.some(p => p.stun > 100) : w.bullets.length > 0 && w.muzzle > 0)) return i; }
  return -1; }"""

async def view(br, demo, picture):
    ctx = await br.new_context(viewport={'width': 1440, 'height': 900}); pg = await ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    await pg.goto(A.base + '/explore#' + demo)
    await pg.wait_for_function("(id) => window.ExploreDemos && window.ExploreDemos[id] && window.ExploreDemos[id].world()", arg=demo, timeout=30000)
    await pg.click('#demo-%s [data-role=pause]' % demo)
    found = await pg.evaluate(PICTURE.replace('DEMO', json.dumps(demo)), 'stun' if demo == 'shoot-predator' else 'shot')
    if found < 0: found = await pg.evaluate(PICTURE.replace('DEMO', json.dumps(demo)), 'shot')   # no hunter hit this time: a shot instead
    await pg.wait_for_timeout(300)
    os.makedirs(A.shots, exist_ok=True); await pg.screenshot(path=os.path.join(A.shots, picture))
    t = await pg.evaluate(LIVE.replace('DEMO', json.dumps(demo)), A.steps)
    await ctx.close()
    ok = not errs and t['shots'] > 0 and (t['minGap'] is None or t['minGap'] >= t['cooldown'])   # the exact cooldown rule is in tools/shoot_check.js
    print(('ok   ' if ok else 'FAIL ') + '#%s: %s, picture after %d steps, errors: %s' % (demo, json.dumps(t), found, errs or 'none'))
    return ok

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path=A.chrome, args=['--no-sandbox'])
        r = [await view(br, 'shoot', '35-shoot.png'), await view(br, 'shoot-predator', '35-shoot-predator.png')]
        await br.close()
    return all(r)

sys.exit(0 if asyncio.run(main()) else 1)
