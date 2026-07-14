// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    mapping(address => bool) public blockedRecipients;

    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function setBlockedRecipient(address account, bool blocked) external {
        blockedRecipients[account] = blocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(to == address(0) || !blockedRecipients[to], "RECIPIENT_BLOCKED");
        super._update(from, to, value);
    }
}
