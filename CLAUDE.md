# Vantage.ai

This is an early stage project to build a product that will eventually listen to sales calls and provide insights into possible training solutions that the salesperson can use to improve their performance.

Note that there is a LOT of experimental code. You can feel free to play around, modify, and suggest totally different routes if you think it will be worth it.

Importantly, keep everything SIMPLE!

## Tools used
- **Frontend**: React, TailwindCSS, DaisyUI, react query, nanostores
    - Always use daisyui classes where possible. You can check context7 if needed
    - We do NOT use tailwind.config.js. We use the @plugin syntax in our index.css files.
- **Backend**: Node.js, Hono, Drizzle
- **Misc**: Mise is used for task management, env variables, tools, EVERYTHING! Look at @mise.toml to get a good lay of the land.
    - ALWAYS go read mise files to see what tasks to run. You can run one by calling `mise run <taskname>`.
        - You may list tasks with `mise t`
    - You should NEVER go run a task not defined in the mise file. If you need something added, check first.

- If you encounter a typescript error from an endpoint on the frontend, you need to regenerate the client. Run `mise r honotypes` to do this.
- pnpm is used, NOT NPM.


## Project structure
There is a @frontend and @backend directory. The frontend is built with React and the backend is built with Node.js and Hono.

There is also the @lovable submodule. It is an AI generated proof of concept. It should only ever be referenced for styling. It is not meant to be a functional part of the app.


### Backend
The backend will use drizzle for the database. It uses Hono to serve the frontend and API endpoints. It will just be a monolith for now and will build in the frontend to the end image.

* The schema is located in `backend/src/data/schema.ts`.
* The main routes file is `backend/src/index.tsx`.
* All seed users and data are in a file `backend/utils/seed.ts`


### Frontend
The frontend uses tailwindcss for styling. It is as close to vanilla react as possible.

## Code Preferences
- Prefer ?? to ||
- Do not use npm, pnpm is used everywhere. There is also no typecheck command, just use tsc in the frontend/backend folder to check
  - Make sure you use `tsc -b --noEmit`. The `-b` is REQUIRED in the directory.
- When running tests against new code, you will only ever need to generate the migrations. You do not need to actually migrate
- NEVER use fetch to make calls to localhost. Use the hono client
- Don't create your own SVGs or use characters/emojis, always use the lucide library

## Testing, checking, and linting.
`mise t -x | grep check` to see all the check:ci commands (currently `check:ci:lint`, `check:ci:build`, `check:ci:test`), there's linting, formatting, building, and testing. You may use them in various orders or just go `check:ci` and it will run all in the same order as in the remote.
- Just use mise r honotypes
- DON'T EVER USE NPX
- never EVER EVER USE PNPM DIRECTLY UNLESS YOU ARE GIVEN PERMISSION. ALWAYS ALWAYS CHECK THE `**/*.toml` files in the repo to see mise tasks that do what you want.
- always use toMatchResponse in the setup.ts vitest file instead of expecting directly on statuses and such