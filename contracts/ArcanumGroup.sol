// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ArcanumFeeCollector} from "./ArcanumFeeCollector.sol";

interface IArcanumMessengerKeys {
    function encryptionKeys(address account) external view returns (string memory);
}

contract ArcanumGroup is ArcanumFeeCollector {
    uint256 public constant GROUP_MESSAGE_FEE = 0.05 ether;
    uint256 public constant MAX_GROUP_MEMBERS = 20;
    uint256 public constant MAX_GROUP_NAME_BYTES = 64;
    uint256 public constant MAX_CIPHERTEXT_BYTES = 4096;
    uint256 public constant MAX_CRYPTO_META_BYTES = 1024;
    uint256 public constant MAX_WRAPPED_KEY_BYTES = 256;
    uint256 public constant MAX_PAGE_SIZE = 100;

    struct Group {
        uint256 id;
        string name;
        address owner;
        uint256 createdAt;
        uint256 membershipVersion;
        uint256 memberCount;
        uint256 pendingInviteCount;
    }

    struct GroupMessage {
        uint256 id;
        uint256 groupId;
        address sender;
        bytes ciphertext;
        bytes cryptoMeta;
        uint256 membershipVersion;
        uint256 timestamp;
    }

    struct GroupMessageView {
        uint256 id;
        uint256 groupId;
        address sender;
        bytes ciphertext;
        bytes cryptoMeta;
        bytes wrappedKey;
        uint256 membershipVersion;
        uint256 timestamp;
    }

    IArcanumMessengerKeys public immutable messenger;
    uint256 public groupCount;
    uint256 public messageCount;

    mapping(uint256 => Group) private groups;
    mapping(uint256 => address[]) private groupMembers;
    mapping(uint256 => mapping(address => bool)) private members;
    mapping(uint256 => mapping(address => bool)) private admins;
    mapping(uint256 => mapping(address => bool)) private pendingInvites;
    mapping(uint256 => mapping(address => uint256)) private memberIndexPlusOne;
    mapping(address => uint256[]) private accountGroupIds;
    mapping(uint256 => mapping(address => bool)) private accountHasGroup;
    mapping(address => uint256[]) private pendingGroupIds;
    mapping(address => mapping(uint256 => uint256)) private pendingGroupIndexPlusOne;
    mapping(uint256 => uint256[]) private groupMessageIds;
    mapping(uint256 => GroupMessage) private messages;
    mapping(uint256 => mapping(address => bytes)) private wrappedKeysByMessage;

    event GroupCreated(uint256 indexed groupId, address indexed owner, string name, uint256 membershipVersion);
    event GroupRenamed(uint256 indexed groupId, string name);
    event MemberInvited(uint256 indexed groupId, address indexed inviter, address indexed invitee);
    event InviteCancelled(uint256 indexed groupId, address indexed invitee);
    event InviteDeclined(uint256 indexed groupId, address indexed invitee);
    event InviteAccepted(uint256 indexed groupId, address indexed member, uint256 membershipVersion);
    event MemberRemoved(uint256 indexed groupId, address indexed member, address indexed actor, uint256 membershipVersion);
    event MemberLeft(uint256 indexed groupId, address indexed member, uint256 membershipVersion);
    event AdminUpdated(uint256 indexed groupId, address indexed member, bool enabled);
    event OwnershipTransferred(uint256 indexed groupId, address indexed previousOwner, address indexed newOwner);
    event GroupMessageSent(
        uint256 indexed messageId,
        uint256 indexed groupId,
        address indexed sender,
        uint256 membershipVersion,
        uint256 timestamp
    );

    modifier groupExists(uint256 groupId) {
        require(groupId < groupCount, "GROUP_NOT_FOUND");
        _;
    }

    modifier onlyMember(uint256 groupId) {
        require(members[groupId][msg.sender], "MEMBER_REQUIRED");
        _;
    }

    modifier onlyAdmin(uint256 groupId) {
        require(admins[groupId][msg.sender], "ADMIN_REQUIRED");
        _;
    }

    modifier onlyOwner(uint256 groupId) {
        require(groups[groupId].owner == msg.sender, "OWNER_REQUIRED");
        _;
    }

    constructor(address messengerAddress) {
        require(messengerAddress != address(0), "MESSENGER_REQUIRED");
        messenger = IArcanumMessengerKeys(messengerAddress);
    }

    function createGroup(string calldata name) external returns (uint256 groupId) {
        _validateGroupName(name);
        _requireEncryptionKey(msg.sender);

        groupId = groupCount;
        groupCount += 1;

        groups[groupId] = Group({
            id: groupId,
            name: name,
            owner: msg.sender,
            createdAt: block.timestamp,
            membershipVersion: 1,
            memberCount: 0,
            pendingInviteCount: 0
        });

        admins[groupId][msg.sender] = true;
        _addMember(groupId, msg.sender);

        emit GroupCreated(groupId, msg.sender, name, 1);
    }

    function renameGroup(uint256 groupId, string calldata name) external groupExists(groupId) onlyAdmin(groupId) {
        _validateGroupName(name);
        groups[groupId].name = name;
        emit GroupRenamed(groupId, name);
    }

    function inviteMember(uint256 groupId, address invitee) external groupExists(groupId) onlyAdmin(groupId) {
        Group storage group = groups[groupId];
        require(invitee != address(0), "INVITEE_REQUIRED");
        require(!members[groupId][invitee], "ALREADY_MEMBER");
        require(!pendingInvites[groupId][invitee], "INVITE_EXISTS");
        require(group.memberCount + group.pendingInviteCount < MAX_GROUP_MEMBERS, "GROUP_CAPACITY_REACHED");
        _requireEncryptionKey(invitee);

        pendingInvites[groupId][invitee] = true;
        group.pendingInviteCount += 1;
        pendingGroupIndexPlusOne[invitee][groupId] = pendingGroupIds[invitee].length + 1;
        pendingGroupIds[invitee].push(groupId);

        emit MemberInvited(groupId, msg.sender, invitee);
    }

    function cancelInvite(uint256 groupId, address invitee) external groupExists(groupId) onlyAdmin(groupId) {
        require(pendingInvites[groupId][invitee], "INVITE_NOT_FOUND");
        _clearInvite(groupId, invitee);
        emit InviteCancelled(groupId, invitee);
    }

    function acceptInvite(uint256 groupId) external groupExists(groupId) {
        require(pendingInvites[groupId][msg.sender], "INVITE_NOT_FOUND");
        _requireEncryptionKey(msg.sender);

        _clearInvite(groupId, msg.sender);
        _addMember(groupId, msg.sender);
        groups[groupId].membershipVersion += 1;

        emit InviteAccepted(groupId, msg.sender, groups[groupId].membershipVersion);
    }

    function declineInvite(uint256 groupId) external groupExists(groupId) {
        require(pendingInvites[groupId][msg.sender], "INVITE_NOT_FOUND");
        _clearInvite(groupId, msg.sender);
        emit InviteDeclined(groupId, msg.sender);
    }

    function removeMember(uint256 groupId, address member) external groupExists(groupId) onlyAdmin(groupId) {
        Group storage group = groups[groupId];
        require(members[groupId][member], "MEMBER_NOT_FOUND");
        require(member != group.owner, "OWNER_CANNOT_BE_REMOVED");
        require(!admins[groupId][member] || msg.sender == group.owner, "OWNER_REQUIRED_FOR_ADMIN");

        _removeMember(groupId, member);
        group.membershipVersion += 1;

        emit MemberRemoved(groupId, member, msg.sender, group.membershipVersion);
    }

    function leaveGroup(uint256 groupId) external groupExists(groupId) onlyMember(groupId) {
        Group storage group = groups[groupId];
        require(msg.sender != group.owner, "OWNER_MUST_TRANSFER");

        _removeMember(groupId, msg.sender);
        group.membershipVersion += 1;

        emit MemberLeft(groupId, msg.sender, group.membershipVersion);
    }

    function setAdmin(uint256 groupId, address member, bool enabled) external groupExists(groupId) onlyOwner(groupId) {
        require(members[groupId][member], "MEMBER_NOT_FOUND");
        require(member != groups[groupId].owner || enabled, "OWNER_MUST_BE_ADMIN");
        admins[groupId][member] = enabled;
        emit AdminUpdated(groupId, member, enabled);
    }

    function transferOwnership(uint256 groupId, address newOwner) external groupExists(groupId) onlyOwner(groupId) {
        require(members[groupId][newOwner], "MEMBER_NOT_FOUND");
        require(newOwner != msg.sender, "OWNER_UNCHANGED");

        address previousOwner = msg.sender;
        groups[groupId].owner = newOwner;
        admins[groupId][newOwner] = true;

        emit OwnershipTransferred(groupId, previousOwner, newOwner);
        emit AdminUpdated(groupId, newOwner, true);
    }

    function sendGroupMessage(
        uint256 groupId,
        uint256 expectedMembershipVersion,
        bytes calldata ciphertext,
        bytes calldata cryptoMeta,
        bytes[] calldata wrappedKeys
    ) external payable groupExists(groupId) onlyMember(groupId) nonReentrant returns (uint256 messageId) {
        Group storage group = groups[groupId];
        address[] storage currentMembers = groupMembers[groupId];

        require(expectedMembershipVersion == group.membershipVersion, "MEMBERSHIP_VERSION_CHANGED");
        require(msg.value == GROUP_MESSAGE_FEE, "INVALID_GROUP_MESSAGE_FEE");
        require(ciphertext.length > 0, "CIPHERTEXT_REQUIRED");
        require(ciphertext.length <= MAX_CIPHERTEXT_BYTES, "CIPHERTEXT_TOO_LARGE");
        require(cryptoMeta.length > 0, "CRYPTO_META_REQUIRED");
        require(cryptoMeta.length <= MAX_CRYPTO_META_BYTES, "CRYPTO_META_TOO_LARGE");
        require(wrappedKeys.length == currentMembers.length, "WRAPPED_KEYS_MISMATCH");

        messageId = messageCount;
        messageCount += 1;

        messages[messageId] = GroupMessage({
            id: messageId,
            groupId: groupId,
            sender: msg.sender,
            ciphertext: ciphertext,
            cryptoMeta: cryptoMeta,
            membershipVersion: group.membershipVersion,
            timestamp: block.timestamp
        });
        groupMessageIds[groupId].push(messageId);

        for (uint256 i = 0; i < currentMembers.length; i++) {
            require(wrappedKeys[i].length > 0, "WRAPPED_KEY_REQUIRED");
            require(wrappedKeys[i].length <= MAX_WRAPPED_KEY_BYTES, "WRAPPED_KEY_TOO_LARGE");
            wrappedKeysByMessage[messageId][currentMembers[i]] = wrappedKeys[i];
        }

        _recordFee(messageId, msg.value);
        emit GroupMessageSent(messageId, groupId, msg.sender, group.membershipVersion, block.timestamp);
    }

    function getGroup(uint256 groupId) external view groupExists(groupId) returns (Group memory) {
        return groups[groupId];
    }

    function getMembers(uint256 groupId) external view groupExists(groupId) returns (address[] memory) {
        return groupMembers[groupId];
    }

    function isMember(uint256 groupId, address account) external view returns (bool) {
        return members[groupId][account];
    }

    function isAdmin(uint256 groupId, address account) external view returns (bool) {
        return admins[groupId][account];
    }

    function hasPendingInvite(uint256 groupId, address account) external view returns (bool) {
        return pendingInvites[groupId][account];
    }

    function getAccountGroupCount(address account) external view returns (uint256) {
        return accountGroupIds[account].length;
    }

    function getPendingGroupCount(address account) external view returns (uint256) {
        return pendingGroupIds[account].length;
    }

    function getAccountGroupIdsPage(address account, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _uintPage(accountGroupIds[account], offset, limit);
    }

    function getPendingGroupIdsPage(address account, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _uintPage(pendingGroupIds[account], offset, limit);
    }

    function getGroupMessageCount(uint256 groupId) external view groupExists(groupId) returns (uint256) {
        return groupMessageIds[groupId].length;
    }

    function getWrappedKey(uint256 messageId, address account) external view returns (bytes memory) {
        require(messageId < messageCount, "MESSAGE_NOT_FOUND");
        return wrappedKeysByMessage[messageId][account];
    }

    function getGroupMessagesPageFor(
        uint256 groupId,
        address account,
        uint256 offset,
        uint256 limit
    ) external view groupExists(groupId) returns (GroupMessageView[] memory) {
        require(limit <= MAX_PAGE_SIZE, "PAGE_TOO_LARGE");
        uint256[] storage ids = groupMessageIds[groupId];

        if (offset >= ids.length || limit == 0) {
            return new GroupMessageView[](0);
        }

        uint256 end = offset + limit;
        if (end > ids.length) {
            end = ids.length;
        }

        GroupMessageView[] memory result = new GroupMessageView[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            uint256 messageId = ids[i];
            GroupMessage storage storedMessage = messages[messageId];
            result[i - offset] = GroupMessageView({
                id: storedMessage.id,
                groupId: storedMessage.groupId,
                sender: storedMessage.sender,
                ciphertext: storedMessage.ciphertext,
                cryptoMeta: storedMessage.cryptoMeta,
                wrappedKey: wrappedKeysByMessage[messageId][account],
                membershipVersion: storedMessage.membershipVersion,
                timestamp: storedMessage.timestamp
            });
        }

        return result;
    }

    function _validateGroupName(string calldata name) private pure {
        require(bytes(name).length > 0, "GROUP_NAME_REQUIRED");
        require(bytes(name).length <= MAX_GROUP_NAME_BYTES, "GROUP_NAME_TOO_LARGE");
    }

    function _requireEncryptionKey(address account) private view {
        require(bytes(messenger.encryptionKeys(account)).length > 0, "ENCRYPTION_KEY_REQUIRED");
    }

    function _addMember(uint256 groupId, address member) private {
        Group storage group = groups[groupId];
        members[groupId][member] = true;
        memberIndexPlusOne[groupId][member] = groupMembers[groupId].length + 1;
        groupMembers[groupId].push(member);
        group.memberCount += 1;

        if (!accountHasGroup[groupId][member]) {
            accountHasGroup[groupId][member] = true;
            accountGroupIds[member].push(groupId);
        }
    }

    function _removeMember(uint256 groupId, address member) private {
        address[] storage list = groupMembers[groupId];
        uint256 index = memberIndexPlusOne[groupId][member] - 1;
        uint256 lastIndex = list.length - 1;

        if (index != lastIndex) {
            address movedMember = list[lastIndex];
            list[index] = movedMember;
            memberIndexPlusOne[groupId][movedMember] = index + 1;
        }

        list.pop();
        delete memberIndexPlusOne[groupId][member];
        delete members[groupId][member];
        delete admins[groupId][member];
        groups[groupId].memberCount -= 1;
    }

    function _clearInvite(uint256 groupId, address invitee) private {
        uint256[] storage list = pendingGroupIds[invitee];
        uint256 index = pendingGroupIndexPlusOne[invitee][groupId] - 1;
        uint256 lastIndex = list.length - 1;

        if (index != lastIndex) {
            uint256 movedGroupId = list[lastIndex];
            list[index] = movedGroupId;
            pendingGroupIndexPlusOne[invitee][movedGroupId] = index + 1;
        }

        list.pop();
        delete pendingGroupIndexPlusOne[invitee][groupId];
        delete pendingInvites[groupId][invitee];
        groups[groupId].pendingInviteCount -= 1;
    }

    function _uintPage(uint256[] storage values, uint256 offset, uint256 limit) private view returns (uint256[] memory) {
        require(limit <= MAX_PAGE_SIZE, "PAGE_TOO_LARGE");
        if (offset >= values.length || limit == 0) {
            return new uint256[](0);
        }

        uint256 end = offset + limit;
        if (end > values.length) {
            end = values.length;
        }

        uint256[] memory result = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = values[i];
        }
        return result;
    }
}
