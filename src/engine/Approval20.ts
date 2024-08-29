import { BigNumber, Contract, providers, utils } from "ethers";
import { TransactionRequest } from "@ethersproject/abstract-provider";
import { Base } from "./Base";
import { isAddress } from "ethers/lib/utils";



import ERC20_ABI from '../abiJson/ERC20.json';

export class ApprovalERC20 extends Base {
  private _sender: string; 
  private _recipient: string;
  private _tokenContract: Contract;
  
  constructor(provider: providers.JsonRpcProvider, sender: string, recipient: string, tokenContract: string) {
    super();
    if (!isAddress(sender)) throw new Error("Bad Address")
    if (!isAddress(recipient)) throw new Error("Bad Address")
    this._sender = sender;
    this._recipient = recipient;
    this._tokenContract = new Contract(tokenContract, ERC20_ABI, provider);
  }
  async description(): Promise<string> {    
    return "Approve ERC20 token " + (await this.getTokenBalance(this._sender)).toString() + " @ " + this._tokenContract.address + " from " + this._sender + " to " + this._recipient

  }

  async getSponsoredTransactions(value: string): Promise<Array<TransactionRequest>> {
    const tokenBalance = await this.getTokenBalance(this._sender);
    const tokenDecimal = await this.getTokenDecimal();
    console.log("decimal", tokenDecimal);
    const amount = utils.parseUnits(value, tokenDecimal);
    console.log("amount", amount.toString(), "tokenBalance", tokenBalance.toString(), "contractAddress", this._tokenContract.address);
    if ((tokenBalance).lt(amount)) {
      throw new Error("Token balance is Less than approval amount!");
    }
    return [{
      ...(await this._tokenContract.populateTransaction.approve(this._recipient, amount))
    }]
  }

  private async getTokenBalance(tokenHolder: string): Promise<BigNumber> {
    return (await this._tokenContract.functions.balanceOf(tokenHolder))[0];
  }

  private async getTokenDecimal(): Promise<number> {
    return (await this._tokenContract.decimals());
  }
}