// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title CyberPayPayroll
/// @notice Confidential payroll + treasury stipend demo for Zama bounty.
contract CyberPayPayroll is ZamaEthereumConfig, Ownable {
    struct EmployeePayroll {
        euint64 monthlyStipend;
        euint64 accrued;
        euint64 claimed;
        bool enabled;
    }

    struct EmployeeMirror {
        uint64 monthlyStipend;
        uint64 accrued;
        uint64 claimed;
    }

    mapping(address => EmployeePayroll) private _employees;
    mapping(address => EmployeeMirror) private _mirrors;
    mapping(address => bool) private _knownEmployee;
    address[] private _employeeList;

    euint64 private _totalBudgetAllocated;
    euint64 private _totalBudgetClaimed;
    uint64 private _totalBudgetAllocatedMirror;
    uint64 private _totalBudgetClaimedMirror;

    bool public immutable demoMode;

    event EmployeeConfigured(address indexed employee, bool enabled, bool plainInput);
    event PayrollExecuted(uint256 indexed cycle, uint256 recipients);
    event Claimed(address indexed employee, bool plainInput);

    uint256 public currentCycle;

    constructor(address admin, bool isDemoMode) Ownable(admin) {
        demoMode = isDemoMode;
    }

    modifier onlyDemoMode() {
        require(demoMode, "demo mode disabled");
        _;
    }

    function _trackEmployee(address employee) internal {
        if (!_knownEmployee[employee]) {
            _knownEmployee[employee] = true;
            _employeeList.push(employee);
        }
    }

    function _allowPayrollCipher(euint64 value, address employee) internal {
        FHE.allowThis(value);
        FHE.allow(value, employee);
        FHE.allow(value, owner());
    }

    function configureEmployee(
        address employee,
        externalEuint64 monthlyStipend,
        bytes calldata inputProof,
        bool enabled
    ) external onlyOwner {
        require(employee != address(0), "invalid employee");

        euint64 stipendCipher = FHE.fromExternal(monthlyStipend, inputProof);
        _allowPayrollCipher(stipendCipher, employee);

        _employees[employee].monthlyStipend = stipendCipher;
        _employees[employee].enabled = enabled;
        _trackEmployee(employee);

        emit EmployeeConfigured(employee, enabled, false);
    }

    function configureEmployeePlain(address employee, uint64 monthlyStipend, bool enabled) external onlyOwner onlyDemoMode {
        require(employee != address(0), "invalid employee");

        euint64 stipendCipher = FHE.asEuint64(monthlyStipend);
        _allowPayrollCipher(stipendCipher, employee);

        _employees[employee].monthlyStipend = stipendCipher;
        _employees[employee].enabled = enabled;

        _mirrors[employee].monthlyStipend = monthlyStipend;
        _trackEmployee(employee);

        emit EmployeeConfigured(employee, enabled, true);
    }

    function runPayroll(address[] calldata workers) external onlyOwner {
        for (uint256 i = 0; i < workers.length; i++) {
            EmployeePayroll storage record = _employees[workers[i]];
            if (!record.enabled) continue;

            record.accrued = FHE.add(record.accrued, record.monthlyStipend);
            _totalBudgetAllocated = FHE.add(_totalBudgetAllocated, record.monthlyStipend);
            FHE.allowThis(_totalBudgetAllocated);
            FHE.allow(_totalBudgetAllocated, owner());

            _allowPayrollCipher(record.accrued, workers[i]);

            if (demoMode) {
                EmployeeMirror storage mirror = _mirrors[workers[i]];
                mirror.accrued += mirror.monthlyStipend;
                _totalBudgetAllocatedMirror += mirror.monthlyStipend;
            }
        }

        currentCycle += 1;
        emit PayrollExecuted(currentCycle, workers.length);
    }

    function claim(externalEuint64 claimAmount, bytes calldata inputProof) external {
        EmployeePayroll storage record = _employees[msg.sender];
        require(record.enabled, "employee disabled");

        euint64 amount = FHE.fromExternal(claimAmount, inputProof);
        euint64 nextClaimed = FHE.add(record.claimed, amount);
        euint64 nextAccrued = FHE.sub(record.accrued, amount);

        record.claimed = nextClaimed;
        record.accrued = nextAccrued;
        _totalBudgetClaimed = FHE.add(_totalBudgetClaimed, amount);

        FHE.allowThis(record.claimed);
        FHE.allow(record.claimed, msg.sender);
        FHE.allow(record.claimed, owner());

        FHE.allowThis(record.accrued);
        FHE.allow(record.accrued, msg.sender);
        FHE.allow(record.accrued, owner());

        FHE.allowThis(_totalBudgetClaimed);
        FHE.allow(_totalBudgetClaimed, owner());

        emit Claimed(msg.sender, false);
    }

    function claimPlain(uint64 claimAmount) external onlyDemoMode {
        EmployeePayroll storage record = _employees[msg.sender];
        require(record.enabled, "employee disabled");
        require(_mirrors[msg.sender].accrued >= claimAmount, "claim exceeds accrued");

        euint64 amount = FHE.asEuint64(claimAmount);
        euint64 nextClaimed = FHE.add(record.claimed, amount);
        euint64 nextAccrued = FHE.sub(record.accrued, amount);

        record.claimed = nextClaimed;
        record.accrued = nextAccrued;
        _totalBudgetClaimed = FHE.add(_totalBudgetClaimed, amount);

        _mirrors[msg.sender].accrued -= claimAmount;
        _mirrors[msg.sender].claimed += claimAmount;
        _totalBudgetClaimedMirror += claimAmount;

        FHE.allowThis(record.claimed);
        FHE.allow(record.claimed, msg.sender);
        FHE.allow(record.claimed, owner());

        FHE.allowThis(record.accrued);
        FHE.allow(record.accrued, msg.sender);
        FHE.allow(record.accrued, owner());

        FHE.allowThis(_totalBudgetClaimed);
        FHE.allow(_totalBudgetClaimed, owner());

        emit Claimed(msg.sender, true);
    }

    function employeeSnapshot(address employee)
        external
        view
        returns (euint64 monthlyStipend, euint64 accrued, euint64 claimed, bool enabled)
    {
        EmployeePayroll storage record = _employees[employee];
        return (record.monthlyStipend, record.accrued, record.claimed, record.enabled);
    }

    function treasurySnapshot() external view returns (euint64 allocated, euint64 claimed) {
        return (_totalBudgetAllocated, _totalBudgetClaimed);
    }

    function listEmployees() external view returns (address[] memory) {
        return _employeeList;
    }

    function employeeMirror(address employee)
        external
        view
        returns (uint64 monthlyStipend, uint64 accrued, uint64 claimed, bool enabled)
    {
        EmployeeMirror storage mirror = _mirrors[employee];
        return (mirror.monthlyStipend, mirror.accrued, mirror.claimed, _employees[employee].enabled);
    }

    function treasuryMirror() external view returns (uint64 allocated, uint64 claimed) {
        return (_totalBudgetAllocatedMirror, _totalBudgetClaimedMirror);
    }
}
