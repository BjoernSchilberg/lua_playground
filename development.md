## Development


This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

### Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Check type errors

```shell
npx tsc --noEmit 2>&1
```

Check Static Export sucessful

```shell
npm run build
```

```shell
rm -rf out && npx next build 2>&1
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Lokales Testen vor dem Deploy (Github Pages)

# 1. Build (simuliert GitHub Actions)
GITHUB_ACTIONS=true npm run build

# 2. SPA-Redirect-Dateien erzeugen
bash scripts/create-spa-redirect.sh out /lua_playground

# 3. Lokalen GitHub-Pages-Simulator starten
python3 scripts/local-ghpages.py

# 4. Testen unter:
#    http://localhost:4000/lua_playground/
#    http://localhost:4000/lua_playground/test
#    http://localhost:4000/lua_playground/hathi
#    http://localhost:4000/lua_playground/tutorial

### Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
