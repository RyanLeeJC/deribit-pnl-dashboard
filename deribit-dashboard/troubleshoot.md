# Troubleshooting notes

## How did you figure the deposit is in BTC? (Row 471)

The CSV **does not put the word “BTC” on row 471**. That row is still **account currency–sized** (small decimals in `Cash Flow` / `Balance` / `Equity`), and the large **`Index Price`** (e.g. `101929.95`) is an **index**, not the deposit unit.

### How the dashboard picks the display unit now

1. Take all parsed rows with a valid **Date**, find the **earliest timestamp** (and any other rows tied to that same instant).
2. Join every **raw CSV cell** on those row(s) into one string (uppercased).
3. Look for whole-word tokens in this order: **ETH, BTC, USDC, USDT, SOL, XRP** — first match wins.
4. If nothing matches, default to **BTC**.

So an ETH options log whose **earliest** row includes something like `ETH-25APR25-2400-C` or `ETH-241970305` is labeled **ETH** everywhere amounts are shown (`inferDisplayUnitFromEarliestRow` in `src/lib/displayUnit.ts`, stored on the model as `meta.displayUnit`). Row 471 is **not** used for that unless it happens to be tied for the earliest date in the file.

### What row 471 actually shows (unchanged facts)

```csv
789023516,1750688647222417,23 Jun 2025 14:24:07,,deposit,-,,,0,0,0,101929.95,0,0.04854452,null,-,0,0,0.04854452,0.04854452,0.04854452,,,Deposit to: bc1qx7s2ft7a6ddf7ytt58avr5dqmnzqz67fwltpa0,
```

- **`Type`**: `deposit`
- **`Index Price`**: `101929.95` (BTC index in USD terms when that was a BTC-margined context — not the cash unit label)
- **`Cash Flow` / `Change` / `Balance` / `Equity`**: `0.04854452`

## Note: PNL (Current) label can be misleading

I realised that this PNL (Current) can be a bit misleading.
User may think that this is the current unrealised PNL on their account right now.
But actually this is the net PNL, by calculating the current value of the equity -minus deposits and transfers.

