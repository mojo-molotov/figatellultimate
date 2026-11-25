---
type: llm
focus: trace
weight: 1
---

page.tsx looks the page up with findByUrl(urlOf(locale, url)) and calls notFound() when it is undefined
