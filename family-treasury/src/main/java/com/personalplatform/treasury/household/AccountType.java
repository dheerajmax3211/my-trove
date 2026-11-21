package com.personalplatform.treasury.household;

/** Standard account types. Posting sign convention: positive = debit, negative = credit. */
public enum AccountType {
    ASSET(true), EXPENSE(true), LIABILITY(false), EQUITY(false), INCOME(false);

    private final boolean debitNormal;

    AccountType(boolean debitNormal) {
        this.debitNormal = debitNormal;
    }

    public boolean debitNormal() {
        return debitNormal;
    }

    /** Raw projection balance (sum of signed postings) expressed on the account's natural side, so a healthy balance is positive. */
    public long natural(long rawBalance) {
        return debitNormal ? rawBalance : Math.negateExact(rawBalance);
    }
}
