---
type: llm
focus: trace
weight: 1
---

page.tsx's generateStaticParams maps mountedUrls to { locale: item.locale, url: segmentsOf(item.url, item.locale) }
