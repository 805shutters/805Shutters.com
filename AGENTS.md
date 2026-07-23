# 805 Shutters Repo Instructions

## Coding Agent

- Use Hermes with provider `openai-codex` and model `gpt-5.6-sol` for coding work in this repository.
- A coding request from Mike includes authorization to complete the full verified production workflow unless he explicitly says `draft`, `do not push`, or `do not deploy`.
- Do not stop after editing files. Keep working until the change passes validation, is committed and pushed, and the production deployment is verified.

## Deployment

- When the user says `Push`, push `main`.
- When the user says `deploy`, deploy this repo to the new Vercel project only.
- Do not route normal deploy work through HostGator or WordPress.
- Deployment target:
  - GitHub repo: `805shutters/805Shutters.com`
  - Branch: `main`
  - Vercel project: `805`
  - Website URL for verification: `https://www.805shutters.com`
- Full coding and deploy flow:
  1. Inspect the existing implementation and repository status.
  2. Implement the requested change.
  3. Run `npm run typecheck`, `npm test`, and `npm run build`.
  4. Review the final diff and stage only intentional source changes.
  5. Commit to `main` using a concise conventional commit message.
  6. Push `origin main`.
  7. Run `npm run deploy:vercel`.
  8. Verify the production change at `https://www.805shutters.com` before reporting completion.
- Database migrations, authentication, payment behavior, destructive operations, and production-secret changes require an additional safety review before execution.
- If validation or deployment fails, fix it and rerun the checks. If an external blocker remains, report the exact blocker instead of claiming completion.
