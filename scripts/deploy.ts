import { ethers } from "hardhat";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const isDemoMode = true;
  const factory = await ethers.getContractFactory("CyberPayPayroll");
  const contract = await factory.deploy(deployer.address, isDemoMode);

  await contract.waitForDeployment();

  console.log("CyberPayPayroll deployed by:", deployer.address);
  console.log("CyberPayPayroll address:", await contract.getAddress());
  console.log("Demo mode:", isDemoMode);

  const network = await ethers.provider.getNetwork();
  const payload = {
    address: await contract.getAddress(),
    chainId: Number(network.chainId),
    demoMode: isDemoMode,
  };
  writeFileSync(join(process.cwd(), "frontend", "deployment.json"), JSON.stringify(payload, null, 2));
  console.log("frontend/deployment.json updated");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
