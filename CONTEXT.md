# BudgetBrains

A personal budgeting app. One person signs in and plans how their pay is divided,
which pay cutoff each expense falls under, and how money moves between the accounts
they hold.

## Language

### Identity

**Account**:
The single sign-in identity, owned by one person and identified by an email address.
_Avoid_: User, login, profile

**Profile**:
One self-contained budget belonging to an Account, with its own Net Pay, Splits and
Subitems. Profiles are alternatives to one another, not parts of a whole — exactly one
is Active, and it alone describes the person's real budget. Amounts are never summed
across Profiles. An Account always has at least one.
_Avoid_: Budget, scenario, workspace

**Active Profile**:
The one Profile currently in view. Every tab reads from it, and only from it.

### Budget

**Net Pay**:
The take-home amount a Profile divides up.

**Split**:
The percentage of Net Pay assigned to Needs, Wants or Savings.

**Subitem**:
A single named expense or savings line inside one of the three Splits.
_Avoid_: Line item, entry, expense

**Cutoff**:
One of the two halves of the pay period. Every Subitem is assigned to Cutoff 1,
Cutoff 2, or Both.
_Avoid_: Period, cycle, paycheck

**Force Assign**:
A Cutoff assignment the person has fixed by hand. Auto-Suggest packs around Force
Assigned Subitems and never reassigns them. The term is "Force Assign" in prose and in
code; only the table column header abbreviates to "Force", because it sits beneath an
Assign to Cutoff column that supplies the other half of the phrase.
_Avoid_: Lock, pin, freeze

### Money movement

**Bank**:
A record of an account the person holds — a bank or an e-wallet. It is typed in by
hand and is not linked to the real institution, so the app never sees real balances
or transactions.
_Avoid_: Linked account, connected account

**Route**:
An ordered pair of Banks that money can move between, carrying a Fee and an optional
free-transfer quota.

**Fee**:
The cost of moving money along a Route once the free-transfer quota is used up.

**Transfer**:
A movement of money from one Bank to another needed to fund the Subitems assigned to
the destination.

### Analysis

**Spending Personality**:
An AI-generated assessment of one Profile's budget — a personality name, a health
score, and tips. It describes a budget; it is not an identity and not a Profile.
_Avoid_: Profile, budget profile

## Boundaries

An **Account** owns Banks, Routes and Fees, because those describe accounts the person
actually holds and prices that do not change with income. Everything keyed to a
Subitem — Splits, Subitems, Cutoff assignments, Bank assignments and Transfers — belongs
to a **Profile**.
