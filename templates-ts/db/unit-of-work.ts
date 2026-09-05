/**
 * The transaction seam.
 *
 * Controllers orchestrate transactions that span more than one module — creating
 * a user and assigning their roles has to be atomic — without ever learning
 * what a transaction actually is. `TxContext` is deliberately opaque: only
 * the ORM adapter that produced it can interpret it.
 *
 * Nothing in this file may reference an ORM type.
 */

declare const txBrand: unique symbol;

/**
 * An open transaction. Opaque by construction — the brand means a caller
 * cannot fabricate one or read anything out of it, so the only way to obtain
 * one is `UnitOfWork.run`.
 */
export interface TxContext {
  readonly [txBrand]?: never;
}

export interface UnitOfWork {
  /**
   * Runs `work` inside a transaction, committing when it resolves and rolling
   * back if it throws.
   */
  run<T>(work: (tx: TxContext) => Promise<T>): Promise<T>;
}

/**
 * A repository is obtained as a function of the transaction it should join.
 *
 * Called with no argument it reads and writes outside any transaction; called
 * with a `TxContext` it is bound to that transaction. This is what lets one
 * module's controller enlist another module's repository in its transaction
 * without importing that module's ORM code.
 */
export type Repo<T> = (tx?: TxContext) => T;
