// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ArcanumMessenger {
    uint256 public constant PRIVATE_MESSAGE_FEE = 0.05 ether;
    uint256 public constant PUBLIC_MESSAGE_FEE = 0.01 ether;
    uint256 public constant MAX_PAYLOAD_BYTES = 4096;
    uint256 public constant MAX_PAGE_SIZE = 100;
    address public constant FEE_CLAIM_WALLET = 0x3406584CCD8cc2fa38BfD3ece96d5dD4371B0040;

    struct Message {
        uint256 id;
        address sender;
        address recipient;
        string payload;
        bool isPrivate;
        uint256 timestamp;
    }

    Message[] private messages;
    mapping(address => uint256[]) private inbox;
    mapping(address => uint256[]) private outbox;
    mapping(address => string) public encryptionKeys;
    mapping(address => bool) public feeClaimWhitelist;
    bool private claimingFees;

    event MessageSent(
        uint256 indexed id,
        address indexed sender,
        address indexed recipient,
        bool isPrivate,
        uint256 timestamp
    );

    event EncryptionKeyRegistered(address indexed account, string publicKey);
    event FeePaid(address indexed sender, uint256 indexed id, uint256 amount);
    event FeesClaimed(address indexed claimer, uint256 amount);

    modifier onlyFeeClaimer() {
        require(feeClaimWhitelist[msg.sender], "FEE_CLAIM_NOT_ALLOWED");
        _;
    }

    modifier nonReentrantClaim() {
        require(!claimingFees, "REENTRANT_CLAIM");
        claimingFees = true;
        _;
        claimingFees = false;
    }

    constructor() {
        feeClaimWhitelist[FEE_CLAIM_WALLET] = true;
    }

    function registerEncryptionKey(string calldata publicKey) external {
        require(bytes(publicKey).length > 0, "PUBLIC_KEY_REQUIRED");
        require(bytes(publicKey).length <= MAX_PAYLOAD_BYTES, "PUBLIC_KEY_TOO_LARGE");
        encryptionKeys[msg.sender] = publicKey;
        emit EncryptionKeyRegistered(msg.sender, publicKey);
    }

    function sendMessage(address recipient, string calldata payload, bool isPrivate) external payable returns (uint256) {
        require(recipient != address(0), "RECIPIENT_REQUIRED");
        require(recipient != msg.sender, "CANNOT_MESSAGE_SELF");
        require(bytes(payload).length > 0, "PAYLOAD_REQUIRED");
        require(bytes(payload).length <= MAX_PAYLOAD_BYTES, "PAYLOAD_TOO_LARGE");

        uint256 requiredFee = isPrivate ? PRIVATE_MESSAGE_FEE : PUBLIC_MESSAGE_FEE;
        require(msg.value == requiredFee, "INVALID_MESSAGE_FEE");

        uint256 id = messages.length;
        Message memory newMessage = Message({
            id: id,
            sender: msg.sender,
            recipient: recipient,
            payload: payload,
            isPrivate: isPrivate,
            timestamp: block.timestamp
        });

        messages.push(newMessage);
        inbox[recipient].push(id);
        outbox[msg.sender].push(id);

        emit MessageSent(id, msg.sender, recipient, isPrivate, block.timestamp);
        emit FeePaid(msg.sender, id, msg.value);
        return id;
    }

    function getInbox(address account) external view returns (Message[] memory) {
        return _messagesFor(inbox[account]);
    }

    function getOutbox(address account) external view returns (Message[] memory) {
        return _messagesFor(outbox[account]);
    }

    function getInboxPage(address account, uint256 offset, uint256 limit) external view returns (Message[] memory) {
        return _messagesPage(inbox[account], offset, limit);
    }

    function getOutboxPage(address account, uint256 offset, uint256 limit) external view returns (Message[] memory) {
        return _messagesPage(outbox[account], offset, limit);
    }

    function getInboxCount(address account) external view returns (uint256) {
        return inbox[account].length;
    }

    function getOutboxCount(address account) external view returns (uint256) {
        return outbox[account].length;
    }

    function messageCount() external view returns (uint256) {
        return messages.length;
    }

    function claim_fees() external onlyFeeClaimer nonReentrantClaim {
        uint256 balance = address(this).balance;
        require(balance > 0, "NO_FEES");

        (bool sent, ) = msg.sender.call{value: balance}("");
        require(sent, "CLAIM_FAILED");

        emit FeesClaimed(msg.sender, balance);
    }

    function _messagesFor(uint256[] storage ids) private view returns (Message[] memory) {
        Message[] memory result = new Message[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = messages[ids[i]];
        }

        return result;
    }

    function _messagesPage(uint256[] storage ids, uint256 offset, uint256 limit) private view returns (Message[] memory) {
        require(limit <= MAX_PAGE_SIZE, "PAGE_TOO_LARGE");

        if (offset >= ids.length || limit == 0) {
            return new Message[](0);
        }

        uint256 end = offset + limit;
        if (end > ids.length) {
            end = ids.length;
        }

        Message[] memory result = new Message[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = messages[ids[i]];
        }

        return result;
    }
}
