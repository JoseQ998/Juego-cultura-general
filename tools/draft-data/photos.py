#!/usr/bin/env python3
"""Busca en Leaguepedia la foto de cada jugador-temporada (list=allimages por prefijo)."""
import json, os, re, sys, time, urllib.parse, urllib.request

D = os.path.dirname(os.path.abspath(__file__))
API = 'https://lol.fandom.com/api.php'
TAGS = {
    'Afreeca Freecs': ['AFS', 'AF'], 'Albus NoX Luna': ['ANX'], "Anyone's Legend": ['AL'],
    'Azubu Frost': ['FRST', 'AZF', 'Frost'], 'Bilibili Gaming': ['BLG'], 'CTBC Flying Oyster': ['CFO'],
    'Cloud9': ['C9'], 'Counter Logic Gaming': ['CLG'], 'Counter Logic Gaming Europe': ['CLG.EU', 'CLGEU', 'CLG EU'],
    'DAMWON Gaming': ['DWG', 'DAMWON'], 'DWG KIA': ['DK', 'DWG'], 'DRX': ['DRX'], 'EDward Gaming': ['EDG'],
    'Epik Gamer': ['EG', 'EPIK'], 'Flash Wolves': ['FW'], 'FlyQuest': ['FLY'], 'Fnatic': ['FNC'],
    'FunPlus Phoenix': ['FPX'], 'G2 Esports': ['G2'], 'Gambit Gaming': ['GMB', 'GAM'], 'Moscow Five': ['M5'],
    'Gen.G': ['GEN'], 'Samsung Blue': ['SSB'], 'Samsung White': ['SSW'], 'Samsung Ozone': ['SSO', 'MVP'],
    'Samsung Galaxy': ['SSG'], 'Griffin': ['GRF'], 'H2k-Gaming': ['H2K'], 'Hanwha Life Esports': ['HLE'],
    'Invictus Gaming': ['IG'], 'JD Gaming': ['JDG'], 'KOO Tigers': ['KOO'], 'ROX Tigers': ['ROX'],
    'KT Rolster': ['KT'], 'LNG Esports': ['LNG'], 'Longzhu Gaming': ['LZ'], 'MAD Lions': ['MAD'],
    'Misfits Gaming': ['MSF'], 'NRG': ['NRG'], 'NaJin Sword': ['NJS'], 'NaJin Black Sword': ['NJBS', 'NJB', 'NJS'],
    'NaJin White Shield': ['NJWS', 'NJW'], 'OMG': ['OMG'], 'Origen': ['OG'], 'Rogue': ['RGE'],
    'Royal Club': ['RC'], 'Star Horn Royal Club': ['SHRC', 'RC'], 'Royal Never Give Up': ['RNG'],
    'SK Telecom T1': ['SKT'], 'T1': ['T1'], 'Splyce': ['SPY'], 'Suning': ['SN'], 'TSM': ['TSM'],
    'Taipei Assassins': ['TPA'], 'Team Pacific': ['TP'], 'Team WE': ['WE'], 'Team gamed!de': ['GDE'],
    'Top Esports': ['TES'], 'Weibo Gaming': ['WBG'], 'Xan': ['XAN'], 'against All authority': ['aAa', 'AAA'],
    'ahq e-Sports Club': ['AHQ', 'ahq'],
}
# Preferencia dentro del mismo año: Worlds primero
EVENT_RANK = ['WC', 'Worlds', 'Summer', 'Split 3', 'Split 2', 'MSI', 'Spring', 'Split 1', 'Winter']


def allimages(prefix):
    url = API + '?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'list': 'allimages', 'aiprefix': prefix, 'ailimit': 100})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'cultura-general-fan-game/1.0'}), timeout=20) as r:
                d = json.load(r)
            if 'error' in d:
                time.sleep(3 * (attempt + 1)); continue
            return [x['name'].replace('_', ' ') for x in d['query']['allimages']]
        except Exception:
            time.sleep(2 * (attempt + 1))
    return None


def score(name, prefix, year):
    rest = name[len(prefix):]
    m = re.match(r' (\d{4})(?: (.*))?\.(png|jpg|jpeg|webp)$', rest, re.I)
    if not m:
        return None
    y, ev = int(m.group(1)), (m.group(2) or '')
    ev_rank = next((i for i, e in enumerate(EVENT_RANK) if ev.startswith(e)), len(EVENT_RANK))
    return (abs(y - year), 0 if y <= year else 1, ev_rank)


def variants(p):
    out = [p, p[:1].upper() + p[1:], p.capitalize(), p.lower(), p.upper()]
    return list(dict.fromkeys(out))


def find(team, player, year):
    best = None
    for tag in TAGS.get(team, []):
        for pv in variants(player):
            prefix = f'{tag} {pv}'
            names = allimages(prefix)
            time.sleep(0.3)
            if not names:
                continue
            for n in names:
                s = score(n, prefix, year)
                if s and (best is None or s < best[0]):
                    best = (s, n)
            if best:
                break
        if best and best[0][0] == 0:
            break
    return best[1] if best else ''


def main():
    out_path = os.path.join(D, 'photos.txt')
    done = {}
    if os.path.exists(out_path):
        for line in open(out_path):
            y, t, p, f = line.rstrip('\n').split('|')
            done[(y, t, p)] = f
    rows = []
    for fn in sorted(f for f in os.listdir(D) if re.fullmatch(r'\d{4}\.txt', f)):
        for line in open(os.path.join(D, fn)):
            if line.strip() and not line.startswith('#'):
                c = line.split('|')
                rows.append((c[0], c[1], c[4]))
    with open(out_path, 'a') as out:
        for y, t, p in rows:
            if (y, t, p) in done:
                continue
            f = find(t, p, int(y))
            out.write(f'{y}|{t}|{p}|{f}\n'); out.flush()
            print(y, t, p, '->', f or '-', flush=True)


if __name__ == '__main__':
    main()
