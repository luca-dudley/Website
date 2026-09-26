# Master Agent Instructions

1. **Context Initialization**: Always load and reference `PROJECT_BRAIN.md` as the primary source of truth before planning or executing tasks.
2. **Skill Discovery**: Use specialized skills in `.agents/skills/` whenever touching database policies, responsive UI files, or pipeline stages.
3. **Session Completion**: Direct the developer to run `agy --agent closer` to summarize diffs and synchronize documentation at the end of each session.
