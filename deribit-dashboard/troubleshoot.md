# Troubleshooting notes

## How did you figure the deposit is in BTC? (Row 471)

I **didn’t “figure out” the deposit is BTC from row 471**. The dashboard currently **assumes all amounts are BTC** because Deribit options accounts are commonly BTC-margined and your CSV’s balance/equity fields look like BTC-sized decimals. That’s an assumption, not a proven detection.

### What row 471 actually shows
Here’s row 471 from your CSV:

```csv
789023516,1750688647222417,23 Jun 2025 14:24:07,,deposit,-,,,0,0,0,101929.95,0,0.04854452,null,-,0,0,0.04854452,0.04854452,0.04854452,,,Deposit to: bc1qx7s2ft7a6ddf7ytt58avr5dqmnzqz67fwltpa0,
```

Important parts:
- **`Type`** is `deposit`
- **`Index Price`** is `101929.95` (that’s a *USD price for BTC*, not a balance unit)
- **`Cash Flow`** is `0.04854452`
- **`Change` / `Balance` / `Equity`** are also `0.04854452`

Row 471 **does not explicitly say “BTC”** anywhere. What it *does* show is:
- Your account balance/equity moved by **0.04854452** units, and
- Deribit provided the **BTC index price** at that time (likely so they can value the cashflow in fiat terms elsewhere).

### Why the app labels it “BTC” today
Because the formatter in the dashboard literally appends `" BTC"` to values:

- `formatBtc(...)` in `src/lib/format.ts` returns `"... BTC"` for any number.
- There is **no currency/unit field** being parsed from the CSV right now.

If you want, next step is to make units explicit:
- Either add a **hard setting** (e.g., “Account currency: BTC / ETH / USDC”)
- Or implement **detection** (e.g., infer from instruments like `BTC-...` vs `ETH-...`, plus typical balance magnitudes), and then label accordingly.

