import {
  FlashbotsBundleProvider, FlashbotsBundleRawTransaction,
  FlashbotsBundleTransaction,
} from "@flashbots/ethers-provider-bundle";
import { BigNumber } from "ethers";
import { parseTransaction } from "ethers/lib/utils";

export const ETHER = BigNumber.from(10).pow(18);
export const GWEI = BigNumber.from(10).pow(9);

export async function checkSimulation(
  flashbotsProvider: FlashbotsBundleProvider,
  signedBundle: Array<string>,
  blockNumber: number
): Promise<BigNumber> {
  const simulationResponse = await flashbotsProvider.simulate(
    signedBundle,
    blockNumber,
    // "latest"
  );
  console.log(
    "targetBlockNumber", blockNumber, "simulationResonpse", simulationResponse
  );
  if ("results" in simulationResponse) {
    for (let i = 0; i < simulationResponse.results.length; i++) {
      const txSimulation = simulationResponse.results[i];
      if ("error" in txSimulation) {
        console.error(
          `TX #${i} : ${txSimulation.error} ${txSimulation.revert}`
        );
        return BigNumber.from(0);
      }
    }

    if (simulationResponse.coinbaseDiff.eq(0)) {
      console.error("Does not pay coinbase");
      return BigNumber.from(0);
    }

    const gasUsed = simulationResponse.results.reduce(
      (acc: number, txSimulation) => acc + txSimulation.gasUsed,
      0
    );

    const gasPrice = simulationResponse.coinbaseDiff.div(gasUsed);
    return gasPrice;
  }

  console.error(
    `Similuation failed, error code: ${simulationResponse.error.code}`
  );
  console.error(simulationResponse.error.message);
  console.error("Failed to simulate response");
  return BigNumber.from(0);
}

export async function printTransactions(
  bundleTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction>,
  signedBundle: Array<string>
): Promise<void> {
  console.log("-------------------------------- print Transactions");
  console.log(
    (
      await Promise.all(
        bundleTransactions.map(
          async (bundleTx, index) => {
            const tx = 'signedTransaction' in bundleTx ? parseTransaction(bundleTx.signedTransaction) : bundleTx.transaction
            const from = 'signer' in bundleTx ? await bundleTx.signer.getAddress() : tx.from

            return `TX #${index}: ${from} => ${tx.to} : ${tx.data}`
          })
      )
    ).join("\n")
  );

  console.log("--------------------------------");
  console.log(
    (
      await Promise.all(
        signedBundle.map(async (signedTx, index) => `TX #${index}: ${signedTx}`)
      )
    ).join("\n")
  );

  console.log("--------------------------------");
}

export function gasPriceToGwei(gasPrice: BigNumber): number {
  return gasPrice.mul(100).div(GWEI).toNumber() / 100;
}
