# Git & Deployment Safety Rules

- **Never push to a git remote automatically.** Do NOT run `git push` (or deploy to production) unless the user explicitly asks you to push in their current message.
- **Always allow manual testing on `localhost` first.** After making and verifying code changes (e.g., via `tsc --noEmit` or local tests), leave the changes locally so the user can test them on `localhost` and push manually when ready, preventing unintended service disruptions.
