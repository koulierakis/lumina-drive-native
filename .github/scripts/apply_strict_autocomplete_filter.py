from pathlib import Path

p = Path('app/index.web.tsx')
s = p.read_text()

old = """      const lastToken = normalizeGreek(q).split(/\\s+/).at(-1) || '';
      const matchingLast = lastToken.length >= 3 ? parsed.filter((p) => normalizeGreek(`${p.name} ${p.address}`).includes(lastToken)) : [];
      if (matchingLast.length) parsed = matchingLast;

      parsed.sort((a, b) => {
"""
new = """      const normalizedQueryTokens = normalizeGreek(q)
        .split(/\\s+/)
        .filter((token) => token.length >= 3 && !/^\\d+$/.test(token));

      if (normalizedQueryTokens.length) {
        const strictMatches = parsed.filter((p) => {
          const hay = normalizeGreek(`${p.name} ${p.address}`);
          return normalizedQueryTokens.every((token) => hay.includes(token));
        });
        parsed = strictMatches;
      }

      parsed.sort((a, b) => {
"""

if old not in s:
    raise SystemExit('STRICT AUTOCOMPLETE TARGET NOT FOUND')

s = s.replace(old, new, 1)
p.write_text(s)
print('STRICT PROGRESSIVE AUTOCOMPLETE FILTER APPLIED')
