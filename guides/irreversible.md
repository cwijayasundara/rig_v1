---
name: irreversible
paths: **/deploy/**, **/migrations/**, **/infra/**, **/*.sql, .github/workflows/**
why: some actions cannot be walked back (production deploys, force-pushes, dropped data); the production gate stops them, and this says why so you stop first
---
# Reversible work proceeds; irreversible work pauses

Do reversible work without asking. Stop and hand over, never run, anything that cannot be walked back. The managed production gate enforces
this for the commands below; this guide says why, so you stop before the gate has to.

## Reversible: proceed
- Editing, adding, renaming or deleting files in a branch. A branch is cheap to discard.
- Committing and pushing to your own branch (no force), opening a PR, running tests, builds and local servers.
- A migration written but not applied, a deploy to a staging or preview environment.

## Irreversible: pause
- A deploy to production. It needs a release manager's approval (`RELEASE_APPROVAL=<ticket>`).
- A force-push (`--force`, `-f`, `--force-with-lease`): it rewrites history other people have pulled.
- Dropping or truncating data (`DROP TABLE`, `DROP DATABASE`, `TRUNCATE TABLE`), deleting a production bucket or volume, rotating or revoking a secret.
- Applying a migration to a shared database, publishing a package or a release, sending a message to real users.

## What to do at an irreversible step
1. Prepare everything up to it: the command, the ticket text, the rollback.
2. Say plainly what is irreversible and who can approve it.
3. Wait. A person approves out of band and resumes the session with the approval set.

A one-way door becomes a two-way door only where a check proves the result and a rollback exists. Where neither does, a person decides.
