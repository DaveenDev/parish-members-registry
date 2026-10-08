# Notes for Claude

## Edge Functions: always give the deploy command

Whenever a change touches anything under `supabase/functions/`, the summary
to the user must include the exact command to redeploy each changed
function, ready to paste. Never just say "redeploy the function". From the
repository root, with the CLI linked to the project (`npx supabase link`):

| Function | Command |
| --- | --- |
| `manage-staff` | `npm run deploy:manage-staff` (or `npx supabase functions deploy manage-staff --use-api`) |
| `media-upload` | `npm run deploy:media-upload` (or `npx supabase functions deploy media-upload --use-api`) |
| `notify-staff` | `npm run deploy:notify-staff` (or `npx supabase functions deploy notify-staff --no-verify-jwt --use-api`) |
| all of them | `npx supabase functions deploy --use-api` |

Without a linked CLI, add `--project-ref <project-ref>` (the live project is
`rmlkowkbonbrtaqocsvo`).

The training site (project `qyoyuukpdjrwfhovtrwd`) has its own shortcuts,
which name the project, so they work whichever project the CLI is linked to.
Give these too, for trying a change there first:

| Function | Training site |
| --- | --- |
| `manage-staff` | `npm run deploy:training:manage-staff` |
| `media-upload` | `npm run deploy:training:media-upload` |
| `notify-staff` | `npm run deploy:training:notify-staff` |
| all of them | `npm run deploy:training` |

Give the migrations to run in the same summary, in order.
