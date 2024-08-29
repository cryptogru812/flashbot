import {
  FlashbotsBundleProvider, FlashbotsBundleRawTransaction,
  FlashbotsBundleResolution,
  FlashbotsBundleTransaction,
  TransactionAccountNonce
} from "@flashbots/ethers-provider-bundle";
import { BigNumber, providers, Wallet } from "ethers";
import dotenv from "dotenv"
import { Base } from "./engine/Base";
import { checkSimulation, gasPriceToGwei, printTransactions } from "./utils";
import { Approval721 } from "./engine/Approval721";
import { TransferERC20 } from "./engine/TransferERC20";
import { ApprovalERC20 } from "./engine/Approval20";

dotenv.config();

require('log-timestamp');

const BLOCKS_IN_FUTURE = 2;

const GWEI = BigNumber.from(10).pow(9);
const PRIORITY_GAS_PRICE = GWEI.mul(50)

const PRIVATE_KEY_EXECUTOR = process.env.PRIVATE_KEY_EXECUTOR || ""
const PRIVATE_KEY_SPONSOR = process.env.PRIVATE_KEY_SPONSOR || ""
const FLASHBOTS_RELAY_SIGNING_KEY = process.env.FLASHBOTS_RELAY_SIGNING_KEY || "";
const RECIPIENT = process.env.RECIPIENT || ""

const swapV2RouterAddress_ethereum = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008"
const WethAddress_ethereum = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"

// const tokenAddress = "";

if (PRIVATE_KEY_EXECUTOR === "") {
  console.warn("Must provide PRIVATE_KEY_EXECUTOR environment variable, corresponding to Ethereum EOA with assets to be transferred")
  process.exit(1)
}
if (PRIVATE_KEY_SPONSOR === "") {
  console.warn("Must provide PRIVATE_KEY_SPONSOR environment variable, corresponding to an Ethereum EOA with ETH to pay miner")
  process.exit(1)
}
if (FLASHBOTS_RELAY_SIGNING_KEY === "") {
  console.warn("Must provide FLASHBOTS_RELAY_SIGNING_KEY environment variable. Please see https://github.com/flashbots/pm/blob/main/guides/flashbots-alpha.md")
  process.exit(1)
}
if (RECIPIENT === "") {
  console.warn("Must provide RECIPIENT environment variable, an address which will receive assets")
  process.exit(1)
}

async function main() {
  const walletRelay = new Wallet(FLASHBOTS_RELAY_SIGNING_KEY)

  const CHAIN_ID = 11155111;
  // const CHAIN_ID = 97; // BSC sepolia
  // ======= UNCOMMENT FOR SEPOLIA ==========
  const provider = new providers.InfuraProvider(CHAIN_ID, process.env.INFURA_API_KEY || '');
  console.log("provider", provider);
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, walletRelay, 'https://relay-sepolia.flashbots.net/');
  // ======= UNCOMMENT FOR GOERLI ==========

  // ======= UNCOMMENT FOR MAINNET ==========
  // const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || "http://127.0.0.1:8545"
  // const provider = new providers.StaticJsonRpcProvider(ETHEREUM_RPC_URL);
  // const flashbotsProvider = await FlashbotsBundleProvider.create(provider, walletRelay);
  // ======= UNCOMMENT FOR MAINNET ==========

  const walletExecutor = new Wallet(PRIVATE_KEY_EXECUTOR);
  const walletSponsor = new Wallet(PRIVATE_KEY_SPONSOR);

  const block = await provider.getBlock("latest")

  // ======= UNCOMMENT FOR ERC20 TRANSFER ==========
  const tokenAddress = "0x45D96b74b9C72f80ec4d9A5Cbd94106cDDaccdC3"; // sepolia
  // const tokenAddress = "0xb947e7EDA4D84304be9811212f28D061915273fc"; // BSC sepolia
  const engine: Base = new TransferERC20(provider, walletExecutor.address, RECIPIENT, tokenAddress);
  const approveWallet = walletSponsor;
  const engine1: Base = new ApprovalERC20(provider, approveWallet.address, swapV2RouterAddress_ethereum, WethAddress_ethereum);
  // ======= UNCOMMENT FOR ERC20 TRANSFER ==========

  // ======= UNCOMMENT FOR 721 Approval ==========
  // const HASHMASKS_ADDRESS = "0xC2C747E0F7004F9E8817Db2ca4997657a7746928";
  // const engine: Base = new Approval721(RECIPIENT, [HASHMASKS_ADDRESS]);
  // ======= UNCOMMENT FOR 721 Approval ==========

  let sponsoredTransactions = await engine.getSponsoredTransactions();
  sponsoredTransactions = [...sponsoredTransactions, ...await engine1.getSponsoredTransactions("0.001")];

  const gasEstimates = await Promise.all(sponsoredTransactions.map(tx =>
    provider.estimateGas({
      ...tx,
      from: tx.from === undefined ? walletExecutor.address : tx.from
    }))
  )
  const gasEstimateTotal = gasEstimates.reduce((acc, cur) => acc.add(cur), BigNumber.from(0))

  const gasPrice = PRIORITY_GAS_PRICE.add(block.baseFeePerGas || 0);
  const bundleTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction> = [
    {
      transaction: {
        to: walletExecutor.address,
        gasPrice: gasPrice,
        value: gasEstimateTotal.mul(gasPrice),
        gasLimit: 21000,
      },
      signer: walletSponsor
    },
    ...sponsoredTransactions.map((transaction, txNumber) => {
      return {
        transaction: {
          ...transaction,
          gasPrice: gasPrice,
          gasLimit: gasEstimates[txNumber],
        },
        signer: walletExecutor,
      }
    })
  ]
  let blockNumber = await provider.getBlockNumber();
  const targetBlockNumber = blockNumber + BLOCKS_IN_FUTURE;
  const signedBundle = await flashbotsProvider.signBundle(bundleTransactions)
  await printTransactions(bundleTransactions, signedBundle);
  const simulatedGasPrice = await checkSimulation(flashbotsProvider, signedBundle, targetBlockNumber);

  console.log(await engine.description())

  // console.log(`Executor Account: ${walletExecutor.address}`)
  // console.log(`Sponsor Account: ${walletSponsor.address}`)
  console.log(`Simulated Gas Price: ${gasPriceToGwei(simulatedGasPrice)} gwei`)
  console.log(`Gas Price: ${gasPriceToGwei(gasPrice)} gwei`)
  console.log(`Gas Used: ${gasEstimateTotal.toString()}`)


  // console.log('checkTransaction', await checkTransaction(provider, "0x821e4ea6470298705074e624225090590b922ac540d05304980737f1eb097f47"));
  while(1) {
    blockNumber = await provider.getBlockNumber();
    const targetBlockNumber = blockNumber + BLOCKS_IN_FUTURE;
    const simulatedGasPrice = await checkSimulation(flashbotsProvider, signedBundle, targetBlockNumber);
    if (!simulatedGasPrice) return;
    console.log(`Current Block Number: ${blockNumber},   Target Block Number:${targetBlockNumber},   gasPrice: ${gasPriceToGwei(simulatedGasPrice)} gwei`)
    // process.exit(0);
    const bundleResponse = await flashbotsProvider.sendBundle(bundleTransactions, targetBlockNumber);
    if ('error' in bundleResponse) {
      throw new Error(bundleResponse.error.message)
    }
    const bundleResolution = await bundleResponse.wait()

    let bundleResult = false;
    bundleResponse?.bundleTransactions?.forEach(async (txAccountNonce: TransactionAccountNonce) => {
      const { hash } = txAccountNonce;
      console.log(`hash: https://sepolia.etherscan.io/tx/${hash}`);
      if (hash) {
        const result = await checkTransaction(provider, hash);
        if (result) {
          bundleResult = true;
        }
      }
    })

    if (bundleResult) {
      console.log(`bundle success!`);
      process.exit(0);
    }
    
    if (bundleResolution === FlashbotsBundleResolution.BundleIncluded) {
      console.log(`Congrats, included in ${targetBlockNumber}`)
      process.exit(0)
    } else if (bundleResolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
      console.log(`Not included in ${targetBlockNumber}`)
    } else if (bundleResolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
      console.log(`Nonce too high, bailing in ${targetBlockNumber}`)
      // process.exit(1)
    }
  };
}


const checkTransaction = async (provider: providers.InfuraProvider, hash: string): Promise<boolean> => {
  try {
    const receipt = await provider.getTransactionReceipt(hash);
    if (receipt) {
      if (receipt?.status) {
        console.log("transaction success!");
        return true;
      }
    }
  } catch (err) {
    console.error(`Error fetching transaction receipt. ${err}`);
  }
  return false;
}

main().then();
