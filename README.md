# Allways Access API widgets

Drop-in website widgets built on the [Allways](https://all-ways.io) Access API. Each widget is its own npm package under `@venturalabs`, so a site installs only what it uses.

| Widget | Install | What it does |
|---|---|---|
| [Tip jar](tip-jar/) | `npm install @venturalabs/allways-tip-jar` | Visitors tip in the coin they hold; you receive TAO or SOL |

Every widget's README starts with a one-prompt install you can hand to a coding agent.

## Repository layout

Every top-level widget folder is a standalone package, and the root is an [npm workspace](https://docs.npmjs.com/cli/using-npm/workspaces) that ties them together.

```
allways-access-api-widgets/
├── package.json         workspace root (private, never published)
├── LICENSE              MIT, covers every widget
├── .github/workflows/
│   ├── ci.yml           typecheck, test, build and pack on every PR and push to main
│   └── release.yml      manual: publishes one widget to npm
└── tip-jar/             @venturalabs/allways-tip-jar
    ├── package.json
    ├── README.md        setup guide and one-prompt install
    ├── src/             TypeScript source (shipped too, for people who copy it in)
    ├── test/
    └── examples/
```

## Developing

```bash
npm install                # every widget's dev dependencies
npm run typecheck          # all widgets
npm test                   # all widgets
npm run build              # all widgets, into each <widget>/dist
npm test -w tip-jar        # one widget
```

## Adding a widget

1. Create `<widget>/` with a `package.json` named `@venturalabs/allways-<widget>`. Copy `tip-jar/package.json`, `tip-jar/tsconfig.*.json` and `tip-jar/vitest.config.ts` as the starting point.
2. Add the folder to `workspaces` in the root `package.json`, and to the `widget` choices in `.github/workflows/release.yml`.
3. Follow the tip jar's rules:
   - The API key only ever lives in a server half, with a one-line adapter per host.
   - Every safeguard that's missing closes the widget instead of opening it.
   - The UI is headless-first (a hook), with a styled reference component on top that needs no CSS import.
   - Tests cover every fail-closed path.
4. Write its README in the same shape as the tip jar's: the one-prompt install, what a human must set up, numbered install steps, an environment variable table, hosting recipes and troubleshooting.
5. Add a row to the table above.

## Releasing

Releases run in GitHub Actions and are triggered by hand. Nobody publishes from a laptop.

**Actions → Release (publish a widget to npm) → Run workflow**, on `main`. Pick the widget and the version bump:
- `patch` for fixes
- `minor` for new features
- `major` for breaking changes

Tick **dry run** to rehearse without publishing anything.

The workflow:
1. Installs dependencies, then typechecks, tests and builds the widget.
2. Bumps the widget's version. It stops if that version is already on npm.
3. Publishes to npm, with [provenance](https://docs.npmjs.com/generating-provenance-statements) once the repository is public.
4. Commits the bump to `main` and tags it `<widget>-v<version>`.
5. Creates a GitHub release with generated notes, and posts to Discord if a webhook is set.

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/): npm trusts this repository's `release.yml` directly, so no npm token is stored anywhere.

**One-time setup, per organization**
1. Turn on two-factor authentication on the npm account. npm now only accepts a **passkey** or a security key for new setups, not an authenticator-app code. A passkey saved in 1Password, Bitwarden, iCloud Keychain or Google Password Manager works.
2. Create the free `venturalabs` organization on [npmjs.com](https://www.npmjs.com/org/create).
3. Make this repository public, since the READMEs link to it and npm provenance needs it.
4. If `main` is branch-protected, add a **`RELEASE_TOKEN`** secret: a fine-grained GitHub token (not an npm token) with contents write access that is allowed to push to `main`. Without branch protection, the built-in token is enough.
5. Optionally add **`DISCORD_WEBHOOK`** for release announcements.

**One-time setup, per new widget.** Trusted publishing can only be attached to a package that already exists, so each widget's first version goes out by hand:
1. From a clean checkout of `main`, run `npm login`, then `npm publish -w <widget>`. npm opens the browser for the passkey.
2. On npmjs.com, open the package → **Settings** → **Trusted publishing** → **GitHub Actions**. Set organization `e35VenturaLabs`, repository `allways-access-api-widgets`, workflow `release.yml`, and no environment.
3. Every later release goes through the workflow.

If trusted publishing ever can't be used, a granular npm token saved as the **`NPM_TOKEN`** secret works as a fallback. Write tokens expire after at most 90 days.

## License

[MIT](LICENSE) © Ventura Labs
