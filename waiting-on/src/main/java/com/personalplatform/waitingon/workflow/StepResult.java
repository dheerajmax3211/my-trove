package com.personalplatform.waitingon.workflow;

/** What an activity found. ITEM_CLOSED: the database says the item is finished (or gone), stop the workflow. */
public enum StepResult {
    DONE, ITEM_CLOSED
}
