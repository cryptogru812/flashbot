import { TransactionRequest } from "@ethersproject/abstract-provider";

export abstract class Base {
  abstract getSponsoredTransactions(value?: string): Promise<Array<TransactionRequest>>;
  abstract description(): Promise<string>;
}
