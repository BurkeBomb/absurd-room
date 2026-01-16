# ABSURD Room (WhatsApp-friendly web game)

Goal: your WhatsApp group plays *together* on a shared web link.

- Players open a link, enter a room code + nickname
- Players submit a card (pick 1 of 3, or type their own)
- Host sees submissions live and clicks a winner
- Host starts the next round

This repo ships with a PG-13 sample deck. You can replace the deck in `data/deck.js`.

## What you need
- A free **Firebase** project with **Firestore** enabled
- A free host (Vercel recommended)

## 1) Create Firebase project
1. Firebase Console → **Add project**
2. In the project → **Build** → **Firestore Database** → **Create database** (Production mode)
3. Project settings → **Add app** → Web (</>) → copy the config values
4. Build → **Authentication** → **Get started** → **Sign-in method** → enable **Anonymous**

## 2) Firestore rules
Firestore → **Rules** → paste the contents of `firestore.rules` (this repo). It requires anonymous auth.

## 3) Run locally
```bash
npm i
cp .env.example .env.local
# fill in the Firebase values in .env.local
npm run dev
```

## 4) Deploy to Vercel (shareable link)
1. Push this repo to GitHub
2. Vercel → **New Project** → import your repo
3. In Vercel Project Settings → **Environment Variables**: copy the same keys from `.env.example`
4. Deploy

Now you have a URL you can paste into the WhatsApp group.

## How to play (in the group)
1. One person opens the link with `?role=host` (or clicks "Host")
2. Everyone else joins as players
3. Host clicks **Start round**, players submit, host clicks a winner

## Make it more savage (without going explicit)
Edit the *tone* strings in `pages/index.js` (search for `Savage mode`) and swap the deck in `data/deck.js`.
