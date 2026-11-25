---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

`figatellultimate build` printed this and exited with code 1:

```text
content/blog/news/Bad Name.mdx
  ✖ file name "Bad Name" breaks the naming rule (lowercase letters, digits and dashes)
    → rename it to "bad-name"
content/blog/news/launch.mdx
  ✖ unknown term "relase" in tags
    → did you mean "release"?
```

What does exit code 1 mean, how do I fix both, does my app keep working with the generated code meanwhile, and what should CI run so this never gets merged? Write your answer to answer.md.
