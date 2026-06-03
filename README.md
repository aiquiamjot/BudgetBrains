# BudgetBrains

A single-page monthly budget allocation dashboard. Plan your take-home pay across Needs, Wants, and Savings; split expenses across biweekly payroll cutoffs; assign costs to specific banks or e-wallets; and generate an optimal bank transfer sequence that minimises fees.

**Live app:** [budgetbrains.vercel.app](https://budgetbrains.vercel.app)

---

## Features

- **Budget overview** — set your net monthly pay, define a Needs / Wants / Savings percentage split, and itemise expenses per category. Live variance indicators and Chart.js donut + bar charts update as you type.
- **Biweekly strategy** — assign each expense to Cutoff 1 (1st–15th), Cutoff 2 (16th–30th), or both (split evenly). An Auto-Suggest button balances the two cutoffs automatically using a greedy bin-packing approach.
- **Bank allocation** — register banks and e-wallets (GCash, Maya, BPI, etc.) and map each expense to the account it will be paid from. A running total per account is displayed on its card.
- **Transfer sequence** — configure which bank-to-bank routes exist, their per-transfer fees, and each bank's free-transfer quota. The app computes the cheapest ordered sequence of transfers for each cutoff, routing through intermediate banks when that reduces fees.
- **TOTP two-factor auth** — account setup generates a TOTP secret compatible with Google Authenticator. Login requires username, password, and a 6-digit code. Password reset is also gated behind TOTP.
- **Light / dark theme** — toggle in the top bar; preference is persisted.

---

## Getting started

### 1. Open the app

Visit **[budgetbrains.vercel.app](https://budgetbrains.vercel.app)** — no installation needed.

### 2. Create your account

The first time you open the app you will see the **Setup** screen:

1. Enter a username and a password (minimum 8 characters).
2. Click **Create Account**.
3. A QR code and a manual entry key are displayed **once**. Scan or copy the key into **Google Authenticator** (or any TOTP app such as Aegis or Authy).
4. Click **I've saved my key — Continue to Login**.

> Keep a backup of your TOTP key. If you lose access to your authenticator and have no backup, you will not be able to log in.

### 3. Sign in

Enter your username, password, and the current 6-digit code from your authenticator app.

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
2. Enter your username and the current 6-digit code from your authenticator app.
3. Enter and confirm a new password, then click **Reset Password**.

---

## Data & privacy

Budget data is stored in **Supabase** and is tied to your account. No data is shared with third parties. To delete your data, clear your account from within the app or contact the maintainer.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Hosting | [Vercel](https://vercel.com) |
| Backend / Database | [Supabase](https://supabase.com) |
| Charts | [Chart.js](https://www.chartjs.org/) |
| 2FA | [OTPAuth](https://github.com/hectorm/otpauth) |
| QR codes | [QRCode.js](https://github.com/soldair/node-qrcode) |
| Icons | [Feather Icons](https://feathericons.com/) |
| Typography | [DM Sans](https://fonts.google.com/specimen/DM+Sans) |
