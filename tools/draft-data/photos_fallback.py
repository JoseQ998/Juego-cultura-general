#!/usr/bin/env python3
"""Segunda pasada: para los jugadores sin foto del año, usa la imagen de su ficha en Leaguepedia."""
import json, os, time, urllib.parse, urllib.request

D = os.path.dirname(os.path.abspath(__file__))
API = 'https://lol.fandom.com/api.php'
path = os.path.join(D, 'photos.txt')
rows = [l.rstrip('\n').split('|') for l in open(path) if l.strip()]
missing = sorted({r[2] for r in rows if not r[3]})


def query(titles):
    url = API + '?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'prop': 'pageimages', 'piprop': 'name',
                                              'redirects': 1, 'titles': '|'.join(titles)})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'cultura-general-fan-game/1.0'}), timeout=20) as r:
                d = json.load(r)
            if 'error' not in d:
                return d
        except Exception:
            pass
        time.sleep(3 * (attempt + 1))
    return {}


found = {}
for i in range(0, len(missing), 50):
    batch = missing[i:i + 50]
    d = query(batch).get('query', {})
    alias = {n['to']: n['from'] for n in d.get('normalized', [])}
    alias.update({r['to']: alias.get(r['from'], r['from']) for r in d.get('redirects', [])})
    for page in d.get('pages', {}).values():
        img = page.get('pageimage')
        if img:
            found[alias.get(page['title'], page['title'])] = img.replace('_', ' ')
    time.sleep(1)

with open(path, 'w') as out:
    for y, t, p, f in rows:
        out.write(f'{y}|{t}|{p}|{f or found.get(p, "")}\n')
print('sin foto antes:', sum(1 for r in rows if not r[3]), '| recuperadas:', sum(1 for r in rows if not r[3] and found.get(r[2])))
