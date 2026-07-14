'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Crown,
  KeyRound,
  Lock,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  UserMinus,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from 'wagmi';
import { isAddress, zeroAddress, type Hex } from 'viem';
import { arcNetworkTestnet, transactionUrl } from '../lib/chain';
import { arcanumMessengerAbi, arcanumMessengerAddress } from '../lib/contract';
import {
  arcanumGroupAbi,
  arcanumGroupAddress,
  groupMessageFee,
  groupMessageFeeLabel,
  isArcanumGroupConfigured,
  maxGroupMembers,
  maxGroupPlaintextBytes,
  type GroupMessageView,
  type GroupSummary,
} from '../lib/groupContract';
import {
  decryptGroupMessage,
  encryptGroupMessage,
  hasStoredEncryptionKey,
  isEncryptionKeyUnlocked,
} from '../lib/crypto';
import type { Language } from './arcanumCopy';

const text = {
  en: {
    title: 'Encrypted Groups', create: 'Create group', groupName: 'Group name', groups: 'Your groups', pending: 'Pending invites',
    empty: 'No groups yet.', accept: 'Accept', decline: 'Decline', former: 'Former member', members: 'Members', invite: 'Invite address',
    rename: 'Rename', leave: 'Leave group', owner: 'Owner', admin: 'Admin', member: 'Member', promote: 'Make admin', demote: 'Remove admin',
    transfer: 'Transfer ownership', remove: 'Remove', message: 'Write an encrypted group message...', send: 'Send encrypted',
    keyRequired: 'Create or unlock your local encryption key before sending or reading group messages.', missingKey: 'Every active member must have an on-chain encryption key.',
    version: 'Membership version', fee: 'Message fee', waiting: 'Waiting for wallet confirmation...', confirmed: 'Transaction confirmed.',
    refresh: 'Refresh', noMessages: 'No encrypted messages in this group.', choose: 'Choose a group to open its encrypted history.',
    disconnected: 'Connect your wallet and switch to Arc Testnet.', unavailable: 'Group contract is not configured yet.', encrypted: 'Encrypted group message', decryptFailed: 'This message cannot be decrypted with the current local key.',
  },
  tr: {
    title: 'Şifreli Gruplar', create: 'Grup oluştur', groupName: 'Grup adı', groups: 'Grupların', pending: 'Bekleyen davetler',
    empty: 'Henüz grup yok.', accept: 'Kabul et', decline: 'Reddet', former: 'Eski üye', members: 'Üyeler', invite: 'Davet adresi',
    rename: 'Yeniden adlandır', leave: 'Gruptan ayrıl', owner: 'Owner', admin: 'Admin', member: 'Üye', promote: 'Admin yap', demote: 'Adminliği kaldır',
    transfer: 'Ownership devret', remove: 'Çıkar', message: 'Şifreli grup mesajı yaz...', send: 'Şifreli gönder',
    keyRequired: 'Grup mesajı göndermek veya okumak için local encryption key oluştur ya da kilidini aç.', missingKey: 'Tüm aktif üyelerin on-chain encryption key kaydı olmalı.',
    version: 'Üyelik sürümü', fee: 'Mesaj ücreti', waiting: 'Cüzdan onayı bekleniyor...', confirmed: 'İşlem onaylandı.',
    refresh: 'Yenile', noMessages: 'Bu grupta henüz şifreli mesaj yok.', choose: 'Şifreli geçmişi açmak için bir grup seç.',
    disconnected: 'Cüzdanını bağla ve Arc Testnet ağına geç.', unavailable: 'Group kontratı henüz yapılandırılmadı.', encrypted: 'Şifreli grup mesajı', decryptFailed: 'Bu mesaj mevcut local key ile çözülemedi.',
  },
} as const;

type GroupEntry = {
  summary: GroupSummary;
  active: boolean;
  pending: boolean;
};

function short(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function errorText(error: unknown) {
  const value = error instanceof Error ? error.message : String(error ?? '');
  const match = value.match(/reverted with reason string '([^']+)'/);
  return match?.[1] ?? value;
}

export function GroupChat({ language, onOpenKeyCenter }: { language: Language; onOpenKeyCenter: () => void }) {
  const copy = text[language];
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const connectedAddress = address ?? zeroAddress;
  const enabled = isConnected && chainId === arcNetworkTestnet.id && isArcanumGroupConfigured;

  const [selectedGroupId, setSelectedGroupId] = useState<bigint | null>(null);
  const [createName, setCreateName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [inviteAddress, setInviteAddress] = useState('');
  const [message, setMessage] = useState('');
  const [pendingAction, setPendingAction] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [lastHash, setLastHash] = useState<Hex>();

  const accountGroupsRead = useReadContract({
    address: arcanumGroupAddress,
    abi: arcanumGroupAbi,
    functionName: 'getAccountGroupIdsPage',
    args: [connectedAddress, 0n, 100n],
    query: { enabled },
  });
  const pendingGroupsRead = useReadContract({
    address: arcanumGroupAddress,
    abi: arcanumGroupAbi,
    functionName: 'getPendingGroupIdsPage',
    args: [connectedAddress, 0n, 100n],
    query: { enabled },
  });

  const accountGroupIds = useMemo(
    () => (accountGroupsRead.data ?? []) as readonly bigint[],
    [accountGroupsRead.data],
  );
  const pendingGroupIds = useMemo(
    () => (pendingGroupsRead.data ?? []) as readonly bigint[],
    [pendingGroupsRead.data],
  );
  const groupIds = useMemo(() => {
    const unique = new Map<string, bigint>();
    [...accountGroupIds, ...pendingGroupIds].forEach((id) => unique.set(id.toString(), id));
    return Array.from(unique.values());
  }, [accountGroupIds, pendingGroupIds]);

  const groupReads = useReadContracts({
    contracts: groupIds.map((groupId) => ({
      address: arcanumGroupAddress,
      abi: arcanumGroupAbi,
      functionName: 'getGroup',
      args: [groupId],
    } as const)),
    query: { enabled: enabled && groupIds.length > 0 },
  });
  const membershipReads = useReadContracts({
    contracts: groupIds.map((groupId) => ({
      address: arcanumGroupAddress,
      abi: arcanumGroupAbi,
      functionName: 'isMember',
      args: [groupId, connectedAddress],
    } as const)),
    query: { enabled: enabled && groupIds.length > 0 },
  });

  const pendingSet = useMemo(() => new Set(pendingGroupIds.map((id) => id.toString())), [pendingGroupIds]);
  const entries = useMemo(() => groupIds.flatMap((groupId, index): GroupEntry[] => {
    const summary = groupReads.data?.[index]?.result as GroupSummary | undefined;
    if (!summary) return [];
    return [{
      summary,
      active: Boolean(membershipReads.data?.[index]?.result),
      pending: pendingSet.has(groupId.toString()),
    }];
  }), [groupIds, groupReads.data, membershipReads.data, pendingSet]);

  useEffect(() => {
    if (selectedGroupId !== null && entries.some((entry) => entry.summary.id === selectedGroupId)) return;
    const firstActive = entries.find((entry) => entry.active);
    setSelectedGroupId(firstActive?.summary.id ?? entries[0]?.summary.id ?? null);
  }, [entries, selectedGroupId]);

  const selectedEntry = entries.find((entry) => entry.summary.id === selectedGroupId);
  const selectedGroup = selectedEntry?.summary;
  const selectedId = selectedGroup?.id ?? 0n;

  useEffect(() => {
    setRenameValue(selectedGroup?.name ?? '');
  }, [selectedGroup?.id, selectedGroup?.name]);

  const membersRead = useReadContract({
    address: arcanumGroupAddress,
    abi: arcanumGroupAbi,
    functionName: 'getMembers',
    args: [selectedId],
    query: { enabled: enabled && selectedGroup !== undefined },
  });
  const messagesRead = useReadContract({
    address: arcanumGroupAddress,
    abi: arcanumGroupAbi,
    functionName: 'getGroupMessagesPageFor',
    args: [selectedId, connectedAddress, 0n, 100n],
    query: { enabled: enabled && selectedGroup !== undefined },
  });
  const currentAdminRead = useReadContract({
    address: arcanumGroupAddress,
    abi: arcanumGroupAbi,
    functionName: 'isAdmin',
    args: [selectedId, connectedAddress],
    query: { enabled: enabled && selectedGroup !== undefined },
  });

  const members = (membersRead.data ?? []) as readonly `0x${string}`[];
  const messages = (messagesRead.data ?? []) as readonly GroupMessageView[];
  const memberAdminReads = useReadContracts({
    contracts: members.map((member) => ({
      address: arcanumGroupAddress,
      abi: arcanumGroupAbi,
      functionName: 'isAdmin',
      args: [selectedId, member],
    } as const)),
    query: { enabled: enabled && members.length > 0 },
  });
  const memberKeyReads = useReadContracts({
    contracts: members.map((member) => ({
      address: arcanumMessengerAddress,
      abi: arcanumMessengerAbi,
      functionName: 'encryptionKeys',
      args: [member],
    } as const)),
    query: { enabled: enabled && members.length > 0 },
  });

  const memberKeys = members.map((member, index) => ({
    address: member,
    publicKey: String(memberKeyReads.data?.[index]?.result ?? ''),
  }));
  const isCurrentAdmin = Boolean(currentAdminRead.data);
  const isCurrentOwner = Boolean(address && selectedGroup?.owner.toLowerCase() === address.toLowerCase());
  const localKeyReady = Boolean(address && hasStoredEncryptionKey(address) && isEncryptionKeyUnlocked(address));
  const allMembersHaveKeys = memberKeys.length > 0 && memberKeys.every((member) => member.publicKey.length > 0);

  async function refresh() {
    await Promise.all([
      accountGroupsRead.refetch(),
      pendingGroupsRead.refetch(),
      groupReads.refetch(),
      membershipReads.refetch(),
      membersRead.refetch(),
      messagesRead.refetch(),
      currentAdminRead.refetch(),
      memberAdminReads.refetch(),
      memberKeyReads.refetch(),
    ]);
  }

  async function execute(actionName: string, action: () => Promise<Hex>, success = copy.confirmed, after?: () => void) {
    if (!publicClient) return;
    setPendingAction(actionName);
    setStatus(copy.waiting);
    setError('');
    try {
      const hash = await action();
      setLastHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus(success);
      after?.();
      await refresh();
    } catch (caught) {
      setStatus('');
      setError(errorText(caught));
    } finally {
      setPendingAction('');
    }
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = createName.trim();
    if (!name || new TextEncoder().encode(name).length > 64) return;
    void execute('create', () => writeContractAsync({
      address: arcanumGroupAddress,
      abi: arcanumGroupAbi,
      functionName: 'createGroup',
      args: [name],
    }), copy.confirmed, () => setCreateName(''));
  }

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroup) return;
    const name = renameValue.trim();
    if (!name || new TextEncoder().encode(name).length > 64) return;
    void execute('rename', () => writeContractAsync({
      address: arcanumGroupAddress,
      abi: arcanumGroupAbi,
      functionName: 'renameGroup',
      args: [selectedGroup.id, name],
    }));
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroup || !isAddress(inviteAddress)) return;
    const invitee = inviteAddress as `0x${string}`;
    void execute('invite', () => writeContractAsync({
      address: arcanumGroupAddress,
      abi: arcanumGroupAbi,
      functionName: 'inviteMember',
      args: [selectedGroup.id, invitee],
    }), copy.confirmed, () => setInviteAddress(''));
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroup || !address || !localKeyReady || !allMembersHaveKeys) return;
    const plaintext = message.trim();
    if (!plaintext || new TextEncoder().encode(plaintext).length > maxGroupPlaintextBytes) return;

    setPendingAction('encrypt');
    setError('');
    try {
      const encrypted = await encryptGroupMessage(plaintext, memberKeys, {
        chainId: arcNetworkTestnet.id,
        contractAddress: arcanumGroupAddress,
        groupId: selectedGroup.id,
        senderAddress: address,
        membershipVersion: selectedGroup.membershipVersion,
      });
      await execute('message', () => writeContractAsync({
        address: arcanumGroupAddress,
        abi: arcanumGroupAbi,
        functionName: 'sendGroupMessage',
        args: [selectedGroup.id, selectedGroup.membershipVersion, encrypted.ciphertext, encrypted.cryptoMeta, encrypted.wrappedKeys],
        value: groupMessageFee,
      }), copy.confirmed, () => setMessage(''));
    } catch (caught) {
      setPendingAction('');
      setError(errorText(caught));
    }
  }

  if (!isArcanumGroupConfigured) {
    return <Notice title={copy.title} body={copy.unavailable} />;
  }
  if (!enabled) {
    return <Notice title={copy.title} body={copy.disconnected} />;
  }

  return (
    <section className="grid min-w-0 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="panel min-h-[640px]">
        <div className="panel-header">
          <div><p className="eyebrow">Group Chat</p><h2 className="panel-title">{copy.title}</h2></div>
          <button type="button" onClick={() => void refresh()} className="btn-ghost h-10 w-10" aria-label={copy.refresh}>
            <RefreshCw size={16} />
          </button>
        </div>

        <form onSubmit={submitCreate} className="mt-4 flex gap-2">
          <input value={createName} onChange={(event) => setCreateName(event.target.value)} className="input" placeholder={copy.groupName} maxLength={64} />
          <button type="submit" disabled={!createName.trim() || Boolean(pendingAction)} className="btn-primary h-11 w-11" aria-label={copy.create}><Plus size={17} /></button>
        </form>

        {entries.some((entry) => entry.pending) ? (
          <div className="mt-5">
            <p className="eyebrow">{copy.pending}</p>
            <div className="mt-2 grid gap-2">
              {entries.filter((entry) => entry.pending).map((entry) => (
                <article key={`invite-${entry.summary.id}`} className="chat-card p-3">
                  <p className="text-sm font-medium text-zinc-100">{entry.summary.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">{short(entry.summary.owner)}</p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => void execute('accept', () => writeContractAsync({ address: arcanumGroupAddress, abi: arcanumGroupAbi, functionName: 'acceptInvite', args: [entry.summary.id] }))} className="btn-primary h-9 flex-1"><Check size={14} />{copy.accept}</button>
                    <button type="button" onClick={() => void execute('decline', () => writeContractAsync({ address: arcanumGroupAddress, abi: arcanumGroupAbi, functionName: 'declineInvite', args: [entry.summary.id] }))} className="btn-ghost h-9 flex-1"><X size={14} />{copy.decline}</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5">
          <p className="eyebrow">{copy.groups}</p>
          <div className="mt-2 grid gap-2">
            {entries.filter((entry) => !entry.pending).length === 0 ? <p className="text-sm text-zinc-500">{copy.empty}</p> : null}
            {entries.filter((entry) => !entry.pending).map((entry) => (
              <button key={entry.summary.id.toString()} type="button" onClick={() => setSelectedGroupId(entry.summary.id)} className={`chat-card p-3 text-left ${selectedGroupId === entry.summary.id ? 'border-emerald-400/35 bg-emerald-400/10' : ''}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-zinc-100">{entry.summary.name}</span>
                  <span className="text-xs text-zinc-500">{entry.summary.memberCount.toString()}/{maxGroupMembers}</span>
                </span>
                <span className="mt-1 block text-xs text-zinc-500">{entry.active ? `v${entry.summary.membershipVersion.toString()}` : copy.former}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {!selectedGroup ? <Notice title={copy.title} body={copy.choose} /> : (
        <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="panel flex min-h-[640px] min-w-0 flex-col">
            <div className="panel-header">
              <div className="min-w-0">
                <p className="eyebrow">#{selectedGroup.id.toString()} · {copy.version} {selectedGroup.membershipVersion.toString()}</p>
                <h2 className="panel-title truncate">{selectedGroup.name}</h2>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200"><Lock size={13} />AES-256-GCM</span>
            </div>

            <div className="mt-4 flex min-h-[360px] flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-800 bg-black/20 p-3">
              {messages.length === 0 ? <p className="m-auto text-sm text-zinc-500">{copy.noMessages}</p> : null}
              {messages.map((item) => (
                <GroupMessageBubble key={item.id.toString()} message={item} viewer={address} language={language} onOpenKeyCenter={onOpenKeyCenter} />
              ))}
            </div>

            {selectedEntry?.active ? (
              <form onSubmit={submitMessage} className="mt-4 space-y-3">
                {!localKeyReady ? <button type="button" onClick={onOpenKeyCenter} className="helper-warning w-full text-left"><KeyRound size={15} className="mr-2 inline" />{copy.keyRequired}</button> : null}
                {!allMembersHaveKeys ? <p className="helper-warning">{copy.missingKey}</p> : null}
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="input min-h-24 resize-none py-3" placeholder={copy.message} />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-zinc-500">{copy.fee}: {groupMessageFeeLabel} · {new TextEncoder().encode(message).length}/{maxGroupPlaintextBytes} bytes</p>
                  <button type="submit" disabled={!message.trim() || !localKeyReady || !allMembersHaveKeys || Boolean(pendingAction)} className="btn-primary h-11 px-5"><Send size={17} />{copy.send}</button>
                </div>
              </form>
            ) : null}

            {(status || error || lastHash) ? (
              <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'}`}>
                <p className="break-words">{error || status}</p>
                {lastHash ? <a href={transactionUrl(lastHash)} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-sky-200 underline">ArcScan</a> : null}
              </div>
            ) : null}
          </section>

          <aside className="panel min-w-0">
            <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-zinc-100">{copy.members}</h3><UsersRound size={17} className="text-zinc-500" /></div>
            {isCurrentAdmin ? (
              <>
                <form onSubmit={submitRename} className="mt-4 flex gap-2">
                  <input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} className="input" maxLength={64} />
                  <button type="submit" className="btn-ghost h-11 w-11" aria-label={copy.rename}><Pencil size={15} /></button>
                </form>
                <form onSubmit={submitInvite} className="mt-2 flex gap-2">
                  <input value={inviteAddress} onChange={(event) => setInviteAddress(event.target.value)} className="input font-mono text-xs" placeholder="0x..." />
                  <button type="submit" disabled={!isAddress(inviteAddress)} className="btn-ghost h-11 w-11" aria-label={copy.invite}><UserPlus size={15} /></button>
                </form>
              </>
            ) : null}

            <div className="mt-4 grid gap-2">
              {members.map((member, index) => {
                const memberIsOwner = member.toLowerCase() === selectedGroup.owner.toLowerCase();
                const memberIsAdmin = Boolean(memberAdminReads.data?.[index]?.result);
                const canRemove = isCurrentAdmin && !memberIsOwner && (!memberIsAdmin || isCurrentOwner);
                return (
                  <article key={member} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs text-zinc-300" title={member}>{short(member)}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">{memberIsOwner ? <Crown size={12} /> : memberIsAdmin ? <ShieldCheck size={12} /> : null}{memberIsOwner ? copy.owner : memberIsAdmin ? copy.admin : copy.member}</span>
                    </div>
                    {(isCurrentOwner && !memberIsOwner) || canRemove ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {isCurrentOwner && !memberIsOwner ? (
                          <button type="button" onClick={() => void execute('admin', () => writeContractAsync({ address: arcanumGroupAddress, abi: arcanumGroupAbi, functionName: 'setAdmin', args: [selectedGroup.id, member, !memberIsAdmin] }))} className="btn-subtle h-8 px-2 text-[11px]">{memberIsAdmin ? copy.demote : copy.promote}</button>
                        ) : null}
                        {isCurrentOwner && !memberIsOwner ? (
                          <button type="button" onClick={() => void execute('transfer', () => writeContractAsync({ address: arcanumGroupAddress, abi: arcanumGroupAbi, functionName: 'transferOwnership', args: [selectedGroup.id, member] }))} className="btn-subtle h-8 px-2 text-[11px]">{copy.transfer}</button>
                        ) : null}
                        {canRemove ? (
                          <button type="button" onClick={() => void execute('remove', () => writeContractAsync({ address: arcanumGroupAddress, abi: arcanumGroupAbi, functionName: 'removeMember', args: [selectedGroup.id, member] }))} className="btn-subtle h-8 px-2 text-[11px] text-red-200"><UserMinus size={12} />{copy.remove}</button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>

            {selectedEntry?.active && !isCurrentOwner ? (
              <button type="button" onClick={() => void execute('leave', () => writeContractAsync({ address: arcanumGroupAddress, abi: arcanumGroupAbi, functionName: 'leaveGroup', args: [selectedGroup.id] }))} className="btn-ghost mt-4 h-10 w-full text-red-200">{copy.leave}</button>
            ) : null}
          </aside>
        </div>
      )}
    </section>
  );
}

function GroupMessageBubble({
  message,
  viewer,
  language,
  onOpenKeyCenter,
}: {
  message: GroupMessageView;
  viewer?: `0x${string}`;
  language: Language;
  onOpenKeyCenter: () => void;
}) {
  const copy = text[language];
  const [plaintext, setPlaintext] = useState<string>();
  const [failed, setFailed] = useState(false);
  const outgoing = Boolean(viewer && message.sender.toLowerCase() === viewer.toLowerCase());

  useEffect(() => {
    let cancelled = false;
    if (!viewer || message.wrappedKey === '0x') {
      setPlaintext(undefined);
      setFailed(true);
      return;
    }
    void decryptGroupMessage(message.ciphertext, message.cryptoMeta, message.wrappedKey, viewer, {
      chainId: arcNetworkTestnet.id,
      contractAddress: arcanumGroupAddress,
      groupId: message.groupId,
      senderAddress: message.sender,
      membershipVersion: message.membershipVersion,
    }).then((value) => {
      if (!cancelled) { setPlaintext(value); setFailed(false); }
    }).catch(() => {
      if (!cancelled) { setPlaintext(undefined); setFailed(true); }
    });
    return () => { cancelled = true; };
  }, [
    message.ciphertext,
    message.cryptoMeta,
    message.groupId,
    message.membershipVersion,
    message.sender,
    message.wrappedKey,
    viewer,
  ]);

  return (
    <article className={`max-w-[88%] rounded-lg border px-3 py-2 ${outgoing ? 'ml-auto border-emerald-400/25 bg-emerald-400/10' : 'mr-auto border-zinc-800 bg-zinc-900'}`}>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{plaintext ?? copy.encrypted}</p>
      {failed ? <button type="button" onClick={onOpenKeyCenter} className="mt-2 text-left text-xs text-amber-200 underline">{copy.decryptFailed}</button> : null}
      <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-zinc-500">
        <MessageCircle size={12} /><span>{new Date(Number(message.timestamp) * 1000).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US')}</span><span>#{message.id.toString()}</span>
      </div>
    </article>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return <section className="panel min-h-[560px]"><p className="eyebrow">Group Chat</p><h2 className="panel-title">{title}</h2><p className="mt-4 text-sm text-zinc-500">{body}</p></section>;
}
