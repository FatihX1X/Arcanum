// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ArcanumAgents {
    uint256 public constant PRIVATE_MESSAGE_FEE = 0.05 ether;
    uint256 public constant PUBLIC_MESSAGE_FEE = 0.01 ether;
    uint256 public constant MAX_PAYLOAD_BYTES = 4096;
    uint256 public constant MAX_PROFILE_BYTES = 4096;
    uint256 public constant MAX_PAGE_SIZE = 100;
    address public constant FEE_CLAIM_WALLET = 0x3406584CCD8cc2fa38BfD3ece96d5dD4371B0040;

    struct Agent {
        address agentAddress;
        string name;
        string description;
        string metadataURI;
        uint256 registeredAt;
        bool isActive;
    }

    struct AgentMessage {
        uint256 id;
        address sender;
        address recipient;
        string payload;
        bool isPrivate;
        uint256 paymentAmount;
        uint256 timestamp;
    }

    AgentMessage[] private messages;
    mapping(address => uint256[]) private inbox;
    mapping(address => uint256[]) private outbox;
    mapping(address => Agent) private agents;
    mapping(address => string) public encryptionKeys;
    mapping(address => bool) public feeClaimWhitelist;
    bool private locked;

    event AgentRegistered(address indexed agent, string name, string metadataURI);
    event AgentUpdated(address indexed agent, string name, string metadataURI);
    event AgentActiveChanged(address indexed agent, bool isActive);
    event EncryptionKeyRegistered(address indexed account, string publicKey);
    event AgentMessageSent(
        uint256 indexed id,
        address indexed sender,
        address indexed recipient,
        bool isPrivate,
        uint256 paymentAmount,
        uint256 timestamp
    );
    event PaymentTransferred(address indexed sender, address indexed recipient, uint256 indexed id, uint256 amount);
    event FeePaid(address indexed sender, uint256 indexed id, uint256 amount);
    event FeesClaimed(address indexed claimer, uint256 amount);

    modifier onlyFeeClaimer() {
        require(feeClaimWhitelist[msg.sender], "FEE_CLAIM_NOT_ALLOWED");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "REENTRANT_CALL");
        locked = true;
        _;
        locked = false;
    }

    constructor() {
        feeClaimWhitelist[FEE_CLAIM_WALLET] = true;
    }

    function registerAgent(string calldata name, string calldata description, string calldata metadataURI) external {
        require(agents[msg.sender].registeredAt == 0, "AGENT_ALREADY_REGISTERED");
        _validateProfile(name, description, metadataURI);

        agents[msg.sender] = Agent({
            agentAddress: msg.sender,
            name: name,
            description: description,
            metadataURI: metadataURI,
            registeredAt: block.timestamp,
            isActive: true
        });

        emit AgentRegistered(msg.sender, name, metadataURI);
    }

    function updateAgent(string calldata name, string calldata description, string calldata metadataURI) external {
        require(agents[msg.sender].registeredAt != 0, "AGENT_NOT_REGISTERED");
        _validateProfile(name, description, metadataURI);

        Agent storage agent = agents[msg.sender];
        agent.name = name;
        agent.description = description;
        agent.metadataURI = metadataURI;

        emit AgentUpdated(msg.sender, name, metadataURI);
    }

    function setAgentActive(bool isActive) external {
        require(agents[msg.sender].registeredAt != 0, "AGENT_NOT_REGISTERED");
        agents[msg.sender].isActive = isActive;
        emit AgentActiveChanged(msg.sender, isActive);
    }

    function getAgent(address account) external view returns (Agent memory) {
        return agents[account];
    }

    function isActiveAgent(address account) public view returns (bool) {
        return agents[account].registeredAt != 0 && agents[account].isActive;
    }

    function registerEncryptionKey(string calldata publicKey) external {
        require(isActiveAgent(msg.sender), "AGENT_NOT_ACTIVE");
        require(bytes(publicKey).length > 0, "PUBLIC_KEY_REQUIRED");
        require(bytes(publicKey).length <= MAX_PAYLOAD_BYTES, "PUBLIC_KEY_TOO_LARGE");
        encryptionKeys[msg.sender] = publicKey;
        emit EncryptionKeyRegistered(msg.sender, publicKey);
    }

    function sendAgentMessage(
        address recipient,
        string calldata payload,
        bool isPrivate,
        uint256 paymentAmount
    ) external payable nonReentrant returns (uint256) {
        require(isActiveAgent(msg.sender), "SENDER_NOT_ACTIVE_AGENT");
        require(isActiveAgent(recipient), "RECIPIENT_NOT_ACTIVE_AGENT");
        require(recipient != msg.sender, "CANNOT_MESSAGE_SELF");
        require(bytes(payload).length > 0, "PAYLOAD_REQUIRED");
        require(bytes(payload).length <= MAX_PAYLOAD_BYTES, "PAYLOAD_TOO_LARGE");

        uint256 requiredFee = isPrivate ? PRIVATE_MESSAGE_FEE : PUBLIC_MESSAGE_FEE;
        require(msg.value == requiredFee + paymentAmount, "INVALID_TOTAL_VALUE");

        uint256 id = messages.length;
        AgentMessage memory newMessage = AgentMessage({
            id: id,
            sender: msg.sender,
            recipient: recipient,
            payload: payload,
            isPrivate: isPrivate,
            paymentAmount: paymentAmount,
            timestamp: block.timestamp
        });

        messages.push(newMessage);
        inbox[recipient].push(id);
        outbox[msg.sender].push(id);

        emit AgentMessageSent(id, msg.sender, recipient, isPrivate, paymentAmount, block.timestamp);
        emit FeePaid(msg.sender, id, requiredFee);

        if (paymentAmount > 0) {
            (bool sent, ) = recipient.call{value: paymentAmount}("");
            require(sent, "PAYMENT_TRANSFER_FAILED");
            emit PaymentTransferred(msg.sender, recipient, id, paymentAmount);
        }

        return id;
    }

    function getInbox(address account) external view returns (AgentMessage[] memory) {
        return _messagesFor(inbox[account]);
    }

    function getOutbox(address account) external view returns (AgentMessage[] memory) {
        return _messagesFor(outbox[account]);
    }

    function getInboxPage(address account, uint256 offset, uint256 limit) external view returns (AgentMessage[] memory) {
        return _messagesPage(inbox[account], offset, limit);
    }

    function getOutboxPage(address account, uint256 offset, uint256 limit) external view returns (AgentMessage[] memory) {
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

    function claim_fees() external onlyFeeClaimer nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "NO_FEES");

        (bool sent, ) = msg.sender.call{value: balance}("");
        require(sent, "CLAIM_FAILED");

        emit FeesClaimed(msg.sender, balance);
    }

    function _validateProfile(string calldata name, string calldata description, string calldata metadataURI) private pure {
        require(bytes(name).length > 0, "AGENT_NAME_REQUIRED");
        require(bytes(name).length <= MAX_PROFILE_BYTES, "AGENT_NAME_TOO_LARGE");
        require(bytes(description).length <= MAX_PROFILE_BYTES, "AGENT_DESCRIPTION_TOO_LARGE");
        require(bytes(metadataURI).length <= MAX_PROFILE_BYTES, "AGENT_METADATA_TOO_LARGE");
    }

    function _messagesFor(uint256[] storage ids) private view returns (AgentMessage[] memory) {
        AgentMessage[] memory result = new AgentMessage[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = messages[ids[i]];
        }

        return result;
    }

    function _messagesPage(uint256[] storage ids, uint256 offset, uint256 limit) private view returns (AgentMessage[] memory) {
        require(limit <= MAX_PAGE_SIZE, "PAGE_TOO_LARGE");

        if (offset >= ids.length || limit == 0) {
            return new AgentMessage[](0);
        }

        uint256 end = offset + limit;
        if (end > ids.length) {
            end = ids.length;
        }

        AgentMessage[] memory result = new AgentMessage[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = messages[ids[i]];
        }

        return result;
    }
}
