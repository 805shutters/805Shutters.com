# 805 Shutters Repo Instructions

- When the user says `Push`, push `main`.
- When the user says `deploy`, deploy this repo to the new Vercel project only.
- Do not route normal deploy work through HostGator or WordPress.
- Deployment target:
  - GitHub repo: `805shutters/805Shutters.com`
  - Branch: `main`
  - Vercel project: `805`
  - Public Vercel URL for verification: `https://805-one.vercel.app`
- Deploy flow:
  1. Stage only intentional website/source changes.
  2. Commit to `main`.
  3. Push `origin main`.
  4. Run `npm run deploy:vercel`.
  5. Report the verified Vercel URL.
