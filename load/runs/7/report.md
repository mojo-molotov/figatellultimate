# Load test: 2500 generated posts per locale

## Times

- figatellultimate build: 84.9 s
- next typegen: 0.4 s
- typecheck (tsc): 3.8 s
- next build: 137.8 s
- figatellultimate search: 24.0 s

## Sizes

- Content: 5507 blog files
- `.figatellultimate/`: 65212.2 kB
- All client JavaScript (`.next/static`): 24 files, 857.1 kB
- Search index (`public/pagefind`): 13329.1 kB

| Page | HTML | HTML gzip | JS loaded by the page | JS gzip |
|---|---|---|---|---|
| `/` | 30.2 kB | 6.8 kB | 644.9 kB | 203.1 kB |
| `/blog` | 41.2 kB | 8.2 kB | 644.9 kB | 203.1 kB |
| `/blog/empire` | 52.1 kB | 9.5 kB | 644.9 kB | 203.1 kB |
| `/blog/empire/decrees` | 60.0 kB | 10.3 kB | 644.9 kB | 203.1 kB |
| `/authors/igor` | 82.3 kB | 13.9 kB | 644.9 kB | 203.1 kB |
| `/docs` | 57.2 kB | 9.8 kB | 644.9 kB | 203.1 kB |
| `/blog/empire/decrees/load-00000` | 50.5 kB | 11.0 kB | 644.9 kB | 203.1 kB |

## Navigation in Chromium (bytes on the wire, per step, prefetches included)

| Step | HTML | RSC | JS | images | other | total |
|---|---|---|---|---|---|---|
| open the home page | 7.6 kB | 19.2 kB (7) | 208.7 kB | 0.0 kB | 10.8 kB | **246.2 kB** |
| go to the blog | 0.0 kB | 24.6 kB (9) | 0.0 kB | 154.8 kB | 0.0 kB | **179.4 kB** |
| go to a category | 0.0 kB | 63.6 kB (17) | 0.0 kB | 181.5 kB | 0.0 kB | **245.1 kB** |
| go to a subcategory | 0.0 kB | 15.3 kB (4) | 14.4 kB | 116.6 kB | 0.0 kB | **146.3 kB** |
| page 2 | 0.0 kB | 38.7 kB (10) | 0.0 kB | 230.5 kB | 0.0 kB | **269.2 kB** |
| sort oldest first | 0.0 kB | 7.7 kB (2) | 0.0 kB | 0.0 kB | 25.9 kB | **33.5 kB** |
| open a post | 0.0 kB | 0.0 kB (0) | 4.6 kB | 50.7 kB | 0.0 kB | **55.3 kB** |
| back to the list | 0.0 kB | 0.0 kB (0) | 0.0 kB | 0.0 kB | 0.0 kB | **0.0 kB** |
| an author page | 0.0 kB | 14.9 kB (4) | 0.0 kB | 540.4 kB | 0.0 kB | **555.3 kB** |
| search "migrations" | 0.0 kB | 9.3 kB (2) | 27.2 kB | 0.0 kB | 106.2 kB | **142.7 kB** |

## Budgets

| Budget | Measured | At most | |
|---|---|---|---|
| typecheck (s) | 3.8 | 10 | ✓ |
| JS gzip of / (kB) | 203.1 | 240 | ✓ |
| JS gzip of /blog (kB) | 203.1 | 240 | ✓ |
| JS gzip of /blog/empire (kB) | 203.1 | 240 | ✓ |
| JS gzip of /blog/empire/decrees (kB) | 203.1 | 240 | ✓ |
| JS gzip of /authors/igor (kB) | 203.1 | 240 | ✓ |
| JS gzip of /docs (kB) | 203.1 | 240 | ✓ |
| JS gzip of /blog/empire/decrees/load-00000 (kB) | 203.1 | 240 | ✓ |
| HTML gzip of / (kB) | 6.8 | 12 | ✓ |
| HTML gzip of /blog (kB) | 8.2 | 12 | ✓ |
| HTML gzip of /docs (kB) | 9.8 | 12 | ✓ |
| HTML gzip of a post (kB) | 11.0 | 25 | ✓ |
| HTML gzip of /blog/empire/decrees (kB) | 10.3 | 14 | ✓ |
| index gzip per listed post on /blog/empire/decrees (bytes) | 39.1 | 120 | ✓ |
| HTML gzip of /authors/igor (kB) | 13.9 | 16 | ✓ |
| index gzip per listed post on /authors/igor (bytes) | 42.1 | 120 | ✓ |
| opening a post (kB on the wire) | 55.3 | 175 | ✓ |
