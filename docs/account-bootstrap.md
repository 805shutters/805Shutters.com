# 805 Shutters account bootstrap

Date: 2026-06-02

This repo is prepared for a standalone 805 Shutters stack, but external account
creation must be completed by the account owner. Do not put passwords, recovery
codes, or service-role keys in git, chat, or Codex memory.

## Target ownership

- Email identity: `805shutters@gmail.com`
- GitHub account: new account owned by `805shutters@gmail.com`
- Supabase project: new project owned by the 805 account/team
- Vercel project: new project connected to the 805 GitHub repository

## Local repo setup already done

The local git author for this repo is set to:

```text
user.name=805 Shutters
user.email=805shutters@gmail.com
```

The repo has a Next.js rebuild, Supabase schema, Vercel prep docs, migration
inventory, and gitignored env handling.

## GitHub setup

1. Create or sign into the GitHub account for `805shutters@gmail.com`.
2. Create a new private repository, recommended name:

```text
805shutters-site
```

3. Authenticate the local machine as that GitHub account:

```bash
gh auth logout
gh auth login --web --git-protocol https
gh auth status
```

4. Connect this repo to the new remote:

```bash
git remote add origin https://github.com/<805-github-username>/805shutters-site.git
git branch -M main
git add .
git commit -m "Prepare 805 Shutters Vercel rebuild"
git push -u origin main
```

Do not push this repo from the currently authenticated `MTSinstallations`
GitHub account unless ownership is intentionally shared.

## Supabase setup

1. Sign into Supabase with `805shutters@gmail.com`.
2. Create a new project, recommended name:

```text
805-shutters
```

3. Link this local repo to the new Supabase project:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

4. Push the database schema:

```bash
npx supabase db push
```

5. In Supabase Project Settings, copy:

- Project URL
- anon public key
- service role key

6. Add those values to Vercel environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL=<project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Keep the service-role key server-side only. Never expose it in browser code.

## Vercel setup

1. Sign into Vercel with the 805 identity or team.
2. Import the GitHub repo.
3. Framework preset should auto-detect as Next.js.
4. Production branch: `main`.
5. Add environment variables from `.env.example`.
6. Deploy the first preview.

Do not attach `805shutters.com` until:

- the preview passes visual QA,
- every audited WordPress URL is covered or redirected,
- the lead form stores rows in Supabase,
- analytics/ad conversion events are configured,
- the domain registrar is accessible for DNS rollback.

## DNS cutover

The current WordPress site remains production until the Vercel preview is ready.
At cutover, add both domains in Vercel:

```text
805shutters.com
www.805shutters.com
```

Then update DNS at the registrar according to Vercel's domain instructions.
Keep WordPress hosting available during the first launch window for rollback.
