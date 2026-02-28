## Database

We use Supabase. The CLI is installed via npx (not Homebrew). The project is already linked.

- Run all Supabase commands with `npx supabase <command>`
- Create migrations: `npx supabase migration new <name>`
- Push migrations: `npx supabase db push`

Never tell me to run SQL in the Supabase dashboard. Always create migration files and push them via the CLI.
