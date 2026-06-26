# USDT Invoice Page Kit

Static, no-build payment page for small services that want a copyable USDT ERC-20 invoice, wallet deeplink, and QR code.

## Files

- `index.html` - single-page invoice generator
- `styles.css` - responsive, neutral styling
- `app.js` - wallet deeplink, QR generation, copy invoice action

## Customize

Open `app.js` and replace:

- `wallet`
- `defaultItem`
- `defaultMemo`

The default token is USDT on Ethereum/ERC-20:

`0xdac17f958d2ee523a2206206994597c13d831ec7`

## Deploy

Upload the folder to GitHub Pages, Netlify, Cloudflare Pages, or any static host.

No server, database, or build step is required.
