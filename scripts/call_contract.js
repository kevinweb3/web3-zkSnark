import { providers, ContractFactory, Contract, utils } from "ethers";
import { groth16 } from "snarkjs";
import { readFileSync } from "fs";
const contractAbi = JSON.parse(readFileSync("../artifact/abi.abi").toString());
const contractBin = readFileSync("../artifact/bin.bin").toString();
const vkey = JSON.parse(
  readFileSync("../artifact/verification_key.json").toString()
);

import { buildPoseidonOpt } from "circomlibjs";

async function main() {
  let provider = new providers.JsonRpcProvider();
  const signer = provider.getSigner();
  let poseidon = await buildPoseidonOpt();
  const data = buf2hex([1, 1, 1]);
  const dataHash = buf2hex(await goodPoseidon(poseidon, [data]));
  //Deploy
  const factory = new ContractFactory(contractAbi, contractBin, signer);

  const contract = await factory.deploy(dataHash);
  await contract.deployed();
  console.log(`deployed to ${contract.address}`);

  //Gen Proof
  let input = {
    data,
    dataHash,
  };

  const { proof, publicSignals } = await groth16.fullProve(
    input,
    "../artifact/circuit.wasm",
    "../artifact/circuit_final.zkey"
  );
  console.log(`proof :\n${JSON.stringify(proof)}`);
  console.log(`public signals:\n ${publicSignals}`);
  //Call contract
  const targetContract = new Contract(contract.address, contractAbi);
  const pA = proof.pi_a.slice(0, 2);
  const pB = [
    [proof.pi_b[0][1], proof.pi_b[0][0]],
    [proof.pi_b[1][1], proof.pi_b[1][0]],
  ];
  const pC = proof.pi_c.slice(0, 2);

  const encoded = utils.defaultAbiCoder.encode(
    ["uint[2]", "uint[2][2]", "uint[2]", "uint[2]"],
    [pA, pB, pC, publicSignals]
  );

  const receipt = await (
    await targetContract.connect(signer).execute(encoded)
  ).wait();
  if (receipt.status !== 1) {
    console.log("tx failed");
    return;
  }
  if (!receipt.events || receipt.events[0]?.event !== "Execute") {
    console.log("tx failed");
    return;
  }
  console.log("success");
}

function buf2hex(buffer) {
  // buffer is an ArrayBuffer
  return (
    "0x" +
    [...new Uint8Array(buffer)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
  );
}

async function goodPoseidon(poseidon, input) {
  const ansInFF = poseidon(input);
  return (await poseidon.F.batchFromMontgomery(ansInFF)).reverse();
}

main();
