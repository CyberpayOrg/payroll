import { ethers } from "hardhat";

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("Set CONTRACT_ADDRESS env first");
  }

  const [admin, employeeA, employeeB] = await ethers.getSigners();
  const contract = await ethers.getContractAt("CyberPayPayroll", contractAddress, admin);

  console.log("Seeding demo data to:", contractAddress);
  console.log("Admin:", admin.address);
  console.log("Employee A:", employeeA.address);
  console.log("Employee B:", employeeB.address);

  let tx = await contract.configureEmployeePlain(employeeA.address, 1500, true);
  await tx.wait();
  tx = await contract.configureEmployeePlain(employeeB.address, 2300, true);
  await tx.wait();

  tx = await contract.runPayroll([employeeA.address, employeeB.address]);
  await tx.wait();

  const [allocated, claimed] = await contract.treasuryMirror();
  console.log("Treasury mirror allocated:", allocated.toString());
  console.log("Treasury mirror claimed:", claimed.toString());
  console.log("Seed completed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
