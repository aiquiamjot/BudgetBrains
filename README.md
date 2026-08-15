# BudgetBrains

A single-page monthly budget allocation dashboard. Plan your take-home pay across Needs, Wants, and Savings; split expenses across biweekly payroll cutoffs; assign costs to specific banks or e-wallets; and generate an optimal bank transfer sequence that minimises fees.

**Live app:** [budgetbrains.vercel.app](https://budgetbrains.vercel.app)

> This is a personal project, shared publicly. Anyone is welcome to sign up and use it, but it comes with no support or uptime guarantee.

---

## Features

- **Profiles** — keep several alternative budgets under one account and switch between them from the top bar. Only one is active at a time.
- **Budget overview** — set your net monthly pay, define a Needs / Wants / Savings percentage split, and itemise expenses per category. Live variance indicators and Chart.js donut + bar charts update as you type.
- **Biweekly strategy** — assign each expense to Cutoff 1 (1st–15th), Cutoff 2 (16th–30th), or both (split evenly). An Auto-Suggest button balances the two cutoffs automatically using a greedy bin-packing approach.
- **Bank allocation** — register banks and e-wallets (GCash, Maya, BPI, etc.) and map each expense to the account it will be paid from. A running total per account is displayed on its card.
- **Transfer sequence** — configure which bank-to-bank routes exist, their per-transfer fees, and each bank's free-transfer quota. The app computes the cheapest ordered sequence of transfers for each cutoff, routing through intermediate banks when that reduces fees.
- **Spending personality** — optional AI assessment of the active profile's budget, powered by Groq. Off unless you supply your own API key. Using it sends your net pay and every expense line to Groq's servers.
- **Light / dark theme** — toggle in the top bar; preference is persisted.

---

## Getting started

### 1. Open the app

Visit **[budgetbrains.vercel.app](https://budgetbrains.vercel.app)** — no installation needed.

### 2. Create your account

1. On the **Sign up** screen, enter your email address and a password (minimum 8 characters), then confirm the password.
2. Click **Create Account**.
3. If email confirmation is enabled, check your inbox and click the link before signing in. Otherwise you are signed straight in.

### 3. Sign in

Enter your email address and password on the login screen.

---

## Profiles

A profile is one self-contained budget: its own net pay, splits, expense items, cutoff assignments and bank assignments. Your account can hold several, and the switcher in the top bar chooses which one you are looking at.

**Profiles are alternatives to one another, not parts of a whole.** Exactly one is active at a time, and every tab reads from that one alone. Amounts are never added up across profiles — a second profile is a different answer to "how should I budget my pay", not a second pot of money.

Use it to compare a lean month against a normal one, or to model what a raise would change, without destroying the budget you already trust.

| Action | What happens |
|---|---|
| **New** | You name the profile, then choose whether to start it as a **copy** of the current one (net pay, items and all assignments carried over) or **empty**. |
| **Rename** | Renames the active profile. Nothing else changes. |
| **Delete** | Permanently removes the active profile's net pay, items, cutoff assignments and bank assignments. There is no undo. You cannot delete your last remaining profile. |

Your **banks and transfer fees are shared across every profile** and are not affected by deleting one. They describe the accounts you actually hold, so they do not change when the budget does.

---

## How to use

### Overview tab

| Field | What to do |
|---|---|
| **Net Monthly Pay** | Enter your take-home pay in ₱. |
| **Allocation Split** | Set the percentage for Needs, Wants, and Savings (must total 100). |
| **Add Item** | Click **+ Add Item** inside any category, fill in the name and amount. |
| **Delete Item** | Click the trash icon on any row. The item is also removed from biweekly and bank assignments. |

The summary cards at the bottom show budgeted vs. allocated amounts per category, and a **Remaining / Overage** figure for the whole month.

#### Spending personality (optional, uses Groq)

The Overview tab includes an AI panel that assesses the active profile's budget and returns a personality name, a budget-health score out of 100, and a few actionable tips.

It is inactive until you paste your own [Groq](https://console.groq.com) API key into the panel. The key is stored in your browser's local storage on that device only — it is never sent to Supabase.

> **What leaves your browser:** running the analysis sends your net monthly pay, your Needs / Wants / Savings percentages, and the name and amount of every expense item in the active profile directly to Groq's API. If you would rather that data never left the app, do not add a key — every other feature works without one.

### Biweekly Strategy tab

Each expense you created in the Overview tab appears here. Use the dropdown to assign it to:

- **Cutoff 1 (1–15)** — paid from the first half-month salary
- **Cutoff 2 (16–30)** — paid from the second half-month salary
- **Both (split evenly)** — half the amount is counted in each cutoff

Click **Auto-Suggest** to have the app balance the two cutoffs automatically. The panels at the bottom show the total assigned to each cutoff and how much of that period's half-pay remains.

### Bank Allocation tab

1. Type a bank or e-wallet name (e.g. `BPI`, `GCash`), an optional nickname, select **Bank** or **E-wallet**, and click **Add**.
2. In the table below, use the **Assigned To** dropdown on each expense to link it to an account (or **Cash** for physical cash expenses).
3. Each bank card shows a running total of all expenses assigned to it.

Banks are shared by every profile. Removing one clears its assignments everywhere, not just in the profile you are viewing.

### Transfer Sequence tab

This tab calculates the cheapest way to move money from your salary account (the first bank you added) to all other accounts.

**Step 1 — Configure routes and fees**

For each bank, set:
- **Free transfers** — how many outgoing transfers are free per day / week / month before fees apply.
- **Destination checkboxes** — tick each bank this account can send to, then enter the fee per transfer for that route.

**Step 2 — Read the optimal sequence**

The app generates a numbered step list for **Cutoff 1** and **Cutoff 2** separately. Each step shows:
- Source → destination bank
- Amount to transfer
- Fee (or **Free** / **⚠ No route**)

Where routing through an intermediate bank is cheaper than a direct transfer, the app does that automatically.

**Manual Transfer Steps** — add ad-hoc transfers (e.g. reimbursements) that sit outside the automated sequence.

---

## Resetting your password

1. On the login screen click **Forgot password?**
2. Enter your email address and click **Send Reset Email**.
3. Open the link in the email Supabase sends you.
4. Enter and confirm a new password, then click **Set New Password**.

---

## Data & privacy

Budget data is stored in **Supabase** and is tied to your account.

Nothing is shared with third parties, with one opt-in exception: the **spending personality** feature sends the active profile's budget figures to Groq, and only if you have added your own API key. Without a key, no budget data ever leaves the app.

**Deleting your data.** Deleting a profile permanently removes that profile's budget from the database. Banks and transfer fees are account-level and survive it. There is no in-app way to delete your whole account — contact the maintainer for that.

---

## Local development

There is no build step. Serve the repository root with any static file server:

```bash
python -m http.server 8080
```

On Windows, `launch.bat` opens Chrome directly to `index.html`.

If you fork this, point it at your own backend: replace `SUPABASE_URL` and `SUPABASE_ANON_KEY` at the top of `js/state.js` with your own Supabase project's values, and create the `user_data` table it expects. The schema is documented in [CLAUDE.md](CLAUDE.md); the domain vocabulary is in [CONTEXT.md](CONTEXT.md), and `docs/adr/` records why the main boundaries fall where they do.

Deploy target is Vercel — static hosting, no build config needed.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Hosting | [Vercel](https://vercel.com) |
| Backend / Database | [Supabase](https://supabase.com) |
| Charts | [Chart.js](https://www.chartjs.org/) |
| AI analysis | [Groq](https://groq.com) (`openai/gpt-oss-120b`) |
| Icons | [Feather Icons](https://feathericons.com/) |
| Typography | [DM Sans](https://fonts.google.com/specimen/DM+Sans) |
