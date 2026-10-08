# Notes for Claude

## Edge Functions: always give the deploy command

Whenever a change touches anything under `supabase/functions/`, the summary
to the user must include the exact command to redeploy each changed
function, ready to paste. Never just say "redeploy the function". From the
repository root:

| Function | Live site |
| --- | --- |
| `manage-staff` | `npm run deploy:manage-staff` |
| `media-upload` | `npm run deploy:media-upload` |
| `notify-staff` | `npm run deploy:notify-staff` |
| all of them | `npm run deploy:live` |

These name the live project (`rmlkowkbonbrtaqocsvo`), so they deploy there
whichever project the CLI is linked to. The long form is
`npx supabase functions deploy <name> --project-ref rmlkowkbonbrtaqocsvo --use-api`
(add `--no-verify-jwt` for `notify-staff`).

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
