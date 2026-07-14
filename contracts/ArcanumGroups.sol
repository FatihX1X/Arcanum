// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IArcanumEncryptionKeyRegistry {
    function encryptionKeys(address account) external view returns (string memory);
}

contract ArcanumGroups {
    uint256 public constant GROUP_MESSAGE_FEE = 0.05 ether;
    uint256 public constant MAX_MEMBERS = 25;
    uint256 public constant MAX_PAYLOAD_BYTES = 4096;
    uint256 public constant MAX_ENVELOPE_BYTES = 2048;
    uint256 public constant MAX_PAGE_SIZE = 100;
    address public constant FEE_CLAIM_WALLET = 0x3406584CCD8cc2fa38BfD3ece96d5dD4371B0040;

    address public immutable KEY_REGISTRY;

    struct Group {
        bytes32 id;
        address owner;
        uint64 currentEpoch;
        uint64 createdAt;
        string encryptedMetadata;
    }

    struct GroupMessage {
        uint256 id;
        bytes32 groupId;
        uint64 epoch;
        address sender;
        string payload;
        uint64 timestamp;
    }

    mapping(bytes32 => Group) private groups;
    mapping(bytes32 => address[]) private groupMembers;
    mapping(bytes32 => mapping(address => bool)) private currentMembers;
    mapping(bytes32 => mapping(address => bool)) private knownMembers;
    mapping(address => bytes32[]) private userGroups;
    mapping(bytes32 => mapping(uint64 => mapping(address => string))) private keyEnvelopes;
    mapping(bytes32 => GroupMessage[]) private groupMessages;
    mapping(address => bool) public feeClaimWhitelist;
    bool private locked;

    event GroupCreated(bytes32 indexed groupId, address indexed owner, uint64 indexed epoch, uint256 memberCount);
    event GroupMembersUpdated(bytes32 indexed groupId, uint64 indexed epoch, uint256 memberCount);
    event GroupMessageSent(
        uint256 indexed id,
        bytes32 indexed groupId,
        uint64 indexed epoch,
        address sender,
        uint64 timestamp
    );
    event FeePaid(address indexed sender, bytes32 indexed groupId, uint256 indexed messageId, uint256 amount);
    event FeesClaimed(address indexed claimer, uint256 amount);

    modifier onlyGroupOwner(bytes32 groupId) {
        require(groups[groupId].owner == msg.sender, "GROUP_OWNER_REQUIRED");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "REENTRANT_CALL");
        locked = true;
        _;
        locked = false;
    }

    constructor(address keyRegistry) {
        require(keyRegistry != address(0), "KEY_REGISTRY_REQUIRED");
        KEY_REGISTRY = keyRegistry;
        feeClaimWhitelist[FEE_CLAIM_WALLET] = true;
    }

    function createGroup(
        bytes32 groupId,
        address[] calldata members,
        string calldata encryptedMetadata,
        string[] calldata envelopes
    ) external returns (bytes32) {
        require(groupId != bytes32(0), "GROUP_ID_REQUIRED");
        require(groups[groupId].owner == address(0), "GROUP_ALREADY_EXISTS");
        _validateGroupInput(members, encryptedMetadata, envelopes);

        groups[groupId] = Group({
            id: groupId,
            owner: msg.sender,
            currentEpoch: 1,
            createdAt: uint64(block.timestamp),
            encryptedMetadata: encryptedMetadata
        });

        bool ownerIncluded = _setMembers(groupId, 1, members, envelopes, msg.sender);
        require(ownerIncluded, "OWNER_MUST_BE_MEMBER");

        emit GroupCreated(groupId, msg.sender, 1, members.length);
        return groupId;
    }

    function updateMembers(
        bytes32 groupId,
        address[] calldata members,
        string calldata encryptedMetadata,
        string[] calldata envelopes
    ) external onlyGroupOwner(groupId) returns (uint64) {
        _validateGroupInput(members, encryptedMetadata, envelopes);

        address[] storage previousMembers = groupMembers[groupId];
        for (uint256 i = 0; i < previousMembers.length; i++) {
            currentMembers[groupId][previousMembers[i]] = false;
        }
        delete groupMembers[groupId];

        uint64 nextEpoch = groups[groupId].currentEpoch + 1;
        bool ownerIncluded = _setMembers(groupId, nextEpoch, members, envelopes, msg.sender);
        require(ownerIncluded, "OWNER_MUST_BE_MEMBER");

        groups[groupId].currentEpoch = nextEpoch;
        groups[groupId].encryptedMetadata = encryptedMetadata;

        emit GroupMembersUpdated(groupId, nextEpoch, members.length);
        return nextEpoch;
    }

    function sendGroupMessage(
        bytes32 groupId,
        uint64 epoch,
        string calldata payload
    ) external payable nonReentrant returns (uint256) {
        Group storage group = groups[groupId];
        require(group.owner != address(0), "GROUP_NOT_FOUND");
        require(currentMembers[groupId][msg.sender], "GROUP_MEMBER_REQUIRED");
        require(epoch == group.currentEpoch, "STALE_GROUP_EPOCH");
        require(bytes(payload).length > 0, "PAYLOAD_REQUIRED");
        require(bytes(payload).length <= MAX_PAYLOAD_BYTES, "PAYLOAD_TOO_LARGE");
        require(msg.value == GROUP_MESSAGE_FEE, "INVALID_MESSAGE_FEE");

        uint256 id = groupMessages[groupId].length;
        groupMessages[groupId].push(GroupMessage({
            id: id,
            groupId: groupId,
            epoch: epoch,
            sender: msg.sender,
            payload: payload,
            timestamp: uint64(block.timestamp)
        }));

        emit GroupMessageSent(id, groupId, epoch, msg.sender, uint64(block.timestamp));
        emit FeePaid(msg.sender, groupId, id, msg.value);
        return id;
    }

    function getGroup(bytes32 groupId) external view returns (Group memory) {
        return groups[groupId];
    }

    function getMembers(bytes32 groupId) external view returns (address[] memory) {
        return groupMembers[groupId];
    }

    function isCurrentMember(bytes32 groupId, address account) external view returns (bool) {
        return currentMembers[groupId][account];
    }

    function getGroupsFor(address account) external view returns (bytes32[] memory) {
        return userGroups[account];
    }

    function getKeyEnvelope(bytes32 groupId, uint64 epoch, address account) external view returns (string memory) {
        return keyEnvelopes[groupId][epoch][account];
    }

    function messageCount(bytes32 groupId) external view returns (uint256) {
        return groupMessages[groupId].length;
    }

    function getMessagesPage(
        bytes32 groupId,
        uint256 offset,
        uint256 limit
    ) external view returns (GroupMessage[] memory) {
        require(limit <= MAX_PAGE_SIZE, "PAGE_TOO_LARGE");

        GroupMessage[] storage messages = groupMessages[groupId];
        if (offset >= messages.length || limit == 0) {
            return new GroupMessage[](0);
        }

        uint256 end = offset + limit;
        if (end > messages.length) {
            end = messages.length;
        }

        GroupMessage[] memory result = new GroupMessage[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = messages[i];
        }
        return result;
    }

    function claim_fees() external nonReentrant {
        require(feeClaimWhitelist[msg.sender], "FEE_CLAIM_NOT_ALLOWED");
        uint256 balance = address(this).balance;
        require(balance > 0, "NO_FEES");

        (bool sent, ) = msg.sender.call{value: balance}("");
        require(sent, "CLAIM_FAILED");
        emit FeesClaimed(msg.sender, balance);
    }

    function _validateGroupInput(
        address[] calldata members,
        string calldata encryptedMetadata,
        string[] calldata envelopes
    ) private pure {
        require(members.length >= 2, "TWO_MEMBERS_REQUIRED");
        require(members.length <= MAX_MEMBERS, "TOO_MANY_MEMBERS");
        require(members.length == envelopes.length, "ENVELOPE_COUNT_MISMATCH");
        require(bytes(encryptedMetadata).length > 0, "METADATA_REQUIRED");
        require(bytes(encryptedMetadata).length <= MAX_PAYLOAD_BYTES, "METADATA_TOO_LARGE");
    }

    function _setMembers(
        bytes32 groupId,
        uint64 epoch,
        address[] calldata members,
        string[] calldata envelopes,
        address owner
    ) private returns (bool ownerIncluded) {
        IArcanumEncryptionKeyRegistry registry = IArcanumEncryptionKeyRegistry(KEY_REGISTRY);

        for (uint256 i = 0; i < members.length; i++) {
            address member = members[i];
            require(member != address(0), "MEMBER_REQUIRED");
            require(!currentMembers[groupId][member], "DUPLICATE_MEMBER");
            require(bytes(registry.encryptionKeys(member)).length > 0, "MEMBER_KEY_REQUIRED");
            require(bytes(envelopes[i]).length > 0, "KEY_ENVELOPE_REQUIRED");
            require(bytes(envelopes[i]).length <= MAX_ENVELOPE_BYTES, "KEY_ENVELOPE_TOO_LARGE");

            currentMembers[groupId][member] = true;
            groupMembers[groupId].push(member);
            keyEnvelopes[groupId][epoch][member] = envelopes[i];

            if (!knownMembers[groupId][member]) {
                knownMembers[groupId][member] = true;
                userGroups[member].push(groupId);
            }
            if (member == owner) {
                ownerIncluded = true;
            }
        }
    }
}
