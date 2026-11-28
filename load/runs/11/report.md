# Load test: 2500 generated posts per locale

## Times

- figatellultimate build: 76.0 s
- next typegen: 0.3 s
- typecheck (tsc): 5.7 s
- next build: 132.8 s
- figatellultimate search: 22.8 s

## Sizes

- Strictly typed getter calls typechecked: 5000 (`getBlogPost`, a literal query per generated post and locale)
- Content: 5507 blog files
- `.figatellultimate/`: 65567.6 kB
- All client JavaScript (`.next/static`): 37 files, 1066.8 kB
- Search index (`public/pagefind`): 13310.6 kB

| Page | HTML | HTML gzip | JS loaded by the page | JS gzip |
|---|---|---|---|---|
| `/` | 38.1 kB | 8.3 kB | 699.9 kB | 223.5 kB |
| `/blog` | 51.7 kB | 9.9 kB | 737.1 kB | 236.5 kB |
| `/blog/empire` | 63.3 kB | 11.5 kB | 737.1 kB | 236.5 kB |
| `/blog/empire/decrees` | 74.1 kB | 13.2 kB | 737.1 kB | 236.5 kB |
| `/authors/igor` | 94.4 kB | 16.9 kB | 736.8 kB | 236.3 kB |
| `/docs` | 55.1 kB | 11.1 kB | 699.9 kB | 223.5 kB |
| `/blog/empire/decrees/load-00000` | 59.3 kB | 12.7 kB | 737.1 kB | 236.5 kB |

## Navigation in Chromium (bytes on the wire, per step, prefetches included)

| Step | HTML | RSC | JS | images | other | total |
|---|---|---|---|---|---|---|
| open the home page | 9.1 kB | 21.7 kB (7) | 272.9 kB | 32.1 kB | 11.8 kB | **347.6 kB** |
| go to the blog | 0.0 kB | 30.8 kB (11) | 0.0 kB | 95.3 kB | 1.1 kB | **127.2 kB** |
| go to a category | 0.0 kB | 88.0 kB (23) | 11.2 kB | 125.6 kB | 2.3 kB | **227.1 kB** |
| go to a subcategory | 0.0 kB | 38.8 kB (10) | 0.0 kB | 174.2 kB | 2.8 kB | **215.9 kB** |
| page 2 | 0.0 kB | 34.0 kB (9) | 0.0 kB | 113.7 kB | 0.0 kB | **147.7 kB** |
| sort oldest first | 0.0 kB | 8.2 kB (2) | 0.0 kB | 0.0 kB | 26.0 kB | **34.2 kB** |
| open a post | 0.0 kB | 0.0 kB (0) | 4.2 kB | 37.6 kB | 0.0 kB | **41.8 kB** |
| back to the list | 0.0 kB | 0.0 kB (0) | 0.0 kB | 0.0 kB | 0.0 kB | **0.0 kB** |
| an author page | 0.0 kB | 3.6 kB (3) | 0.0 kB | 93.4 kB | 5.7 kB | **102.7 kB** |
| search "migrations" | 0.0 kB | 46.4 kB (9) | 14.6 kB | 254.5 kB | 0.0 kB | **315.5 kB** |

## Pagination, the server 300 ms away (12 clicks on next, 150 ms apart)

| Listing | Without batches: median | worst | With batches: median | worst |
|---|---|---|---|---|
| `/blog/empire/decrees` | 577 ms | 1217 ms | **58 ms** | **96 ms** |
| `/authors/igor` | 797 ms | 1315 ms | **76 ms** | **122 ms** |

## Budgets

| Budget | Measured | At most | |
|---|---|---|---|
| typecheck (s) | 5.7 | 10 | ✓ |
| JS gzip of / (kB) | 223.5 | 240 | ✓ |
| JS gzip of /blog (kB) | 236.5 | 240 | ✓ |
| JS gzip of /blog/empire (kB) | 236.5 | 240 | ✓ |
| JS gzip of /blog/empire/decrees (kB) | 236.5 | 240 | ✓ |
| JS gzip of /authors/igor (kB) | 236.3 | 240 | ✓ |
| JS gzip of /docs (kB) | 223.5 | 240 | ✓ |
| JS gzip of /blog/empire/decrees/load-00000 (kB) | 236.5 | 240 | ✓ |
| HTML gzip of / (kB) | 8.3 | 12 | ✓ |
| HTML gzip of /blog (kB) | 9.9 | 12 | ✓ |
| HTML gzip of /docs (kB) | 11.1 | 12 | ✓ |
| HTML gzip of a post (kB) | 12.7 | 25 | ✓ |
| HTML gzip of /blog/empire/decrees (kB) | 13.2 | 14 | ✓ |
| index gzip per listed post on /blog/empire/decrees (bytes) | 39.3 | 120 | ✓ |
| HTML gzip of /authors/igor (kB) | 16.9 | 16 | ✖ |
| index gzip per listed post on /authors/igor (bytes) | 42.3 | 120 | ✓ |
| opening a post (kB on the wire) | 41.8 | 175 | ✓ |
| next on /blog/empire/decrees, the median click (ms) | 58.4 | 100 | ✓ |
| next on /blog/empire/decrees, the worst click (ms) | 95.6 | 250 | ✓ |
| next on /authors/igor, the median click (ms) | 76.0 | 100 | ✓ |
| next on /authors/igor, the worst click (ms) | 122.5 | 250 | ✓ |
| a batch gzip (kB) | 1.8 | 10 | ✓ |
