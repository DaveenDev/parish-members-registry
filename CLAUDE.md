# Notes for Claude

## Persistent Development Workflow

At the beginning of every session:
- Retrieve relevant project history from Claude-Mem.
- Review open and blocked Beads tasks.
- Summarize the previous work and outstanding decisions.
- Recommend the next task before starting.

During development:
- Record important architectural decisions.
- Track new bugs, features, and unfinished tasks in Beads.
- Distinguish tasks owned by HUMAN and AI.
- Record blockers and dependencies.
- Update task status as work progresses.
- Do not mark a task complete without verification.

At the end of each session:
- Summarize completed work.
- Record unresolved issues.
- Update Beads tasks.
- Identify the next recommended action.
- Leave a concise handoff for the next session.

Never assume a previous task was completed without checking.
Never automatically execute HUMAN-owned tasks.

## Work with Beads hand-in-hand
Review the current Beads and Claude-Mem setup for this project.

Make sure the project workflow is:
1. Use Beads for tasks, bugs, dependencies, and project status.
2. Use Claude-Mem for persistent coding knowledge and discoveries.
3. At the beginning of a session, check Beads for current work.
4. Before starting significant work, identify or create the appropriate Beads issue.
5. Keep Beads issue status updated as work progresses.
6. Record important architectural decisions and discoveries naturally so Claude-Mem can retain them.
7. Do not duplicate detailed memory into Beads unless it belongs to the task itself.


## Project Task Synchronization

Beads is the authoritative source for project tasks.

At the start of every session:
1. Run `bd prime`.
2. Run `bd ready`.
3. Run `bd list --status open`.
4. Review newly added ideas and outstanding tasks.
5. Separate HUMAN and AI responsibilities.
6. Compare current tasks with relevant Claude-Mem history.
7. Present a concise project status and recommended next action.

Never rely solely on Claude-Mem for outstanding tasks.

When tasks change, update Beads directly.
Do not duplicate Beads tasks into another task tracker.


## Edge Functions: always give the deploy command

Whenever a change touches anything under `supabase/functions/`, the summary
to the user must include the exact command to redeploy each changed
function, ready to paste. Never just say "redeploy the function". From the
repository root:

| Function | Live site |
| --- | --- |
| `manage-staff` | `npm run deploy:production:manage-staff` |
| `media-upload` | `npm run deploy:production:media-upload` |
| `notify-staff` | `npm run deploy:production:notify-staff` |
| all of them | `npm run deploy:production` |

These name the live project (`rmlkowkbonbrtaqocsvo`), so they deploy there
whichever project the CLI is linked to. The long form is
`npx supabase functions deploy <name> --project-ref rmlkowkbonbrtaqocsvo --use-api`
(add `--no-verify-jwt` for `notify-staff`).

The demo site (project `qyoyuukpdjrwfhovtrwd`) has its own shortcuts,
which name the project, so they work whichever project the CLI is linked to.
Give these too, for trying a change there first:

| Function | Demo site |
| --- | --- |
| `manage-staff` | `npm run deploy:demo:manage-staff` |
| `media-upload` | `npm run deploy:demo:media-upload` |
| `notify-staff` | `npm run deploy:demo:notify-staff` |
| all of them | `npm run deploy:demo` |

Give the migrations to run in the same summary, in order.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:46cd31e7 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
