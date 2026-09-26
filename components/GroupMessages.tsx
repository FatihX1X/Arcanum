'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, KeyRound, Loader2, Plus, RefreshCw, Send, Settings2, ShieldCheck, UsersRound, X } from 'lucide-react';
import { isAddress } from 'viem';
import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { arcNetwork, transactionUrl } from '../lib/chain';
import { arcanumMessengerAbi, arcanumMessengerAddress } from '../lib/contract';
import {
  createGroupEncryption,
  createRandomGroupId,
  decryptGroupMessage,
  decryptGroupMetadata,
  encryptGroupMessage,
  openGroupKeyEnvelope,
  type GroupMemberKey,
} from '../lib/crypto';
import {
  arcanumGroupsAbi,
  arcanumGroupsAddress,
  groupMessageFee,
  groupMessageFeeLabel,
  isArcanumGroupsConfigured,
  type GroupMessageRecord,
  type GroupRecord,
} from '../lib/groupsContract';
import { readableRpcError, withRpcRetry } from '../lib/rpc';
import type { Language } from './arcanumCopy';
import { Modal } from './ui';

type GroupView = {
  record: GroupRecord;
  name: string;
  members: `0x${string}`[];
  messages: Array<GroupMessageRecord & { text: string; decryptable: boolean }>;
  isMember: boolean;
};

type ModalMode = 'create' | 'members' | null;

const text = {
  en: {
    eyebrow: 'Group chat', title: 'Encrypted Groups', refresh: 'Refresh', empty: 'No encrypted groups yet.',
    emptyBody: 'Create a group with the + button. Member addresses are public; names and messages are encrypted.',
    noWallet: 'Connect your wallet to load groups.', wrongChain: 'Switch to Arc to use encrypted groups.',
    notConfigured: 'Group contract is not configured yet.', create: 'Create encrypted group', manage: 'Manage members',
    name: 'Group name', members: 'Member addresses', membersHint: 'One address per line or comma. Your wallet is included automatically.',
    privacy: 'Member addresses are visible on-chain. The group name, key and messages remain encrypted.',
    cancel: 'Cancel', continue: 'Continue in wallet', preparing: 'Preparing encrypted group…', pending: 'Transaction pending…',
    confirmed: 'Transaction confirmed.', message: 'Write an encrypted message', send: 'Send', fee: 'Message fee',
    unlock: 'Unlock your local encryption key from Key Center first.', keyMissing: 'Every member must register an encryption key.',
    invalidMembers: 'Enter at least one other valid, unique member address.', tooMany: 'A group can contain at most 25 members.',
    removed: 'You are no longer a current member. Historical messages remain available.',
    rekey: 'Saving members creates a new epoch. New members cannot read old messages and removed members cannot read new ones.',
    encrypted: 'Encrypted message', owner: 'Owner', memberCount: 'members', groupCount: 'groups', emptyMessages: 'No messages in this group yet.', openExplorer: 'Explorer', select: 'Choose a group to start chatting.',
    failed: 'Action failed', close: 'Close', saving: 'Waiting for wallet', noKey: 'Encryption key unavailable for this epoch.',
    rateLimited: 'Arc RPC is busy right now. The request was retried safely; wait a few seconds and try again.',
  },
  tr: {
    eyebrow: 'Grup sohbeti', title: 'Şifreli Gruplar', refresh: 'Yenile', empty: 'Henüz şifreli grup yok.',
    emptyBody: '+ butonuyla grup oluşturun. Üye adresleri görünür; grup adı ve mesajlar şifrelidir.',
    noWallet: 'Grupları yüklemek için cüzdanınızı bağlayın.', wrongChain: 'Şifreli gruplar için Arc ağına geçin.',
    notConfigured: 'Grup contract adresi henüz yapılandırılmadı.', create: 'Şifreli grup oluştur', manage: 'Üyeleri yönet',
    name: 'Grup adı', members: 'Üye adresleri', membersHint: 'Her satıra veya virgülle bir adres. Cüzdanınız otomatik eklenir.',
    privacy: 'Üye adresleri zincirde görünür. Grup adı, anahtar ve mesajlar şifreli kalır.',
    cancel: 'İptal', continue: 'Cüzdanda devam et', preparing: 'Şifreli grup hazırlanıyor…', pending: 'İşlem bekliyor…',
    confirmed: 'İşlem onaylandı.', message: 'Şifreli mesaj yazın', send: 'Gönder', fee: 'Mesaj ücreti',
    unlock: 'Önce Anahtar Merkezi üzerinden yerel şifreleme anahtarınızı açın.', keyMissing: 'Her üyenin şifreleme anahtarı kayıtlı olmalıdır.',
    invalidMembers: 'En az bir farklı, geçerli ve benzersiz üye adresi girin.', tooMany: 'Bir grupta en fazla 25 üye olabilir.',
    removed: 'Artık güncel üye değilsiniz. Geçmiş mesajlara erişiminiz sürer.',
    rekey: 'Üyeleri kaydetmek yeni epoch oluşturur. Yeni üyeler geçmişi, çıkarılan üyeler yeni mesajları okuyamaz.',
    encrypted: 'Şifreli mesaj', owner: 'Sahip', memberCount: 'üye', groupCount: 'grup', emptyMessages: 'Bu grupta henüz mesaj yok.', openExplorer: 'Explorer', select: 'Sohbete başlamak için bir grup seçin.',
    failed: 'İşlem başarısız', close: 'Kapat', saving: 'Cüzdan bekleniyor', noKey: 'Bu epoch için şifreleme anahtarı yok.',
    rateLimited: 'Arc RPC şu anda yoğun. İstek güvenli biçimde yeniden denendi; birkaç saniye bekleyip tekrar deneyin.',
  },
} as const;

function short(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function parseMemberInput(value: string, owner?: `0x${string}`) {
  const raw = value.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
  const unique = new Map<string, `0x${string}`>();
  let invalid = false;
  if (owner) unique.set(owner.toLowerCase(), owner);
  raw.forEach((item) => {
    if (isAddress(item)) {
      unique.set(item.toLowerCase(), item as `0x${string}`);
    } else {
      invalid = true;
    }
  });
  return { members: [...unique.values()], invalid };
}

export default function GroupMessages({ language }: { language: Language }) {
  const copy = text[language];
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: arcNetwork.id });
  const { writeContractAsync, isPending: walletPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash, chainId: arcNetwork.id });
  const [groups, setGroups] = useState<GroupView[]>([]);
  const [selectedId, setSelectedId] = useState<`0x${string}` | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState('');
  const [modal, setModal] = useState<ModalMode>(null);
  const [groupName, setGroupName] = useState('');
  const [memberInput, setMemberInput] = useState('');

  const isCorrectChain = chainId === arcNetwork.id;
  const selected = groups.find((group) => group.record.id === selectedId);

  const readEnvelopeKey = useCallback(async (groupId: `0x${string}`, epoch: number, viewer: `0x${string}`) => {
    if (!publicClient) return null;
    const envelope = await withRpcRetry(() => publicClient.readContract({
      address: arcanumGroupsAddress,
      abi: arcanumGroupsAbi,
      functionName: 'getKeyEnvelope',
      args: [groupId, BigInt(epoch), viewer],
    })) as string;
    if (!envelope) return null;
    return openGroupKeyEnvelope(envelope, viewer, {
      chainId: arcNetwork.id,
      contractAddress: arcanumGroupsAddress,
      groupId,
      epoch,
    });
  }, [publicClient]);

  const refresh = useCallback(async () => {
    if (!publicClient || !address || !isArcanumGroupsConfigured || !isCorrectChain) {
      setGroups([]);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const ids = await withRpcRetry(() => publicClient.readContract({
        address: arcanumGroupsAddress,
        abi: arcanumGroupsAbi,
        functionName: 'getGroupsFor',
        args: [address],
      })) as readonly `0x${string}`[];

      const loaded = await Promise.all(ids.map(async (groupId): Promise<GroupView> => {
        const [record, members, count] = await Promise.all([
          withRpcRetry(() => publicClient.readContract({ address: arcanumGroupsAddress, abi: arcanumGroupsAbi, functionName: 'getGroup', args: [groupId] })),
          withRpcRetry(() => publicClient.readContract({ address: arcanumGroupsAddress, abi: arcanumGroupsAbi, functionName: 'getMembers', args: [groupId] })),
          withRpcRetry(() => publicClient.readContract({ address: arcanumGroupsAddress, abi: arcanumGroupsAbi, functionName: 'messageCount', args: [groupId] })),
        ]) as [GroupRecord, readonly `0x${string}`[], bigint];

        const currentEpoch = Number(record.currentEpoch);
        const keyCache = new Map<number, string | null>();
        const keyFor = async (epoch: number) => {
          if (!keyCache.has(epoch)) {
            try {
              keyCache.set(epoch, await readEnvelopeKey(groupId, epoch, address));
            } catch {
              keyCache.set(epoch, null);
            }
          }
          return keyCache.get(epoch) ?? null;
        };

        let name = `${copy.encrypted} ${short(groupId)}`;
        const currentKey = await keyFor(currentEpoch);
        if (currentKey) {
          try {
            const metadata = await decryptGroupMetadata(record.encryptedMetadata, currentKey, {
              chainId: arcNetwork.id,
              contractAddress: arcanumGroupsAddress,
              groupId,
              epoch: currentEpoch,
            });
            name = metadata.name;
          } catch {
            // The encrypted fallback deliberately avoids leaking metadata.
          }
        }

        const limit = count > 100n ? 100n : count;
        const offset = count > 100n ? count - 100n : 0n;
        const messageRecords = limit === 0n ? [] : await withRpcRetry(() => publicClient.readContract({
          address: arcanumGroupsAddress,
          abi: arcanumGroupsAbi,
          functionName: 'getMessagesPage',
          args: [groupId, offset, limit],
        })) as readonly GroupMessageRecord[];

        const messages = await Promise.all(messageRecords.map(async (item) => {
          const key = await keyFor(Number(item.epoch));
          if (!key) return { ...item, text: copy.noKey, decryptable: false };
          try {
            const value = await decryptGroupMessage(item.payload, key, {
              chainId: arcNetwork.id,
              contractAddress: arcanumGroupsAddress,
              groupId,
              epoch: Number(item.epoch),
              sender: item.sender,
            });
            return { ...item, text: value, decryptable: true };
          } catch {
            return { ...item, text: copy.encrypted, decryptable: false };
          }
        }));

        return {
          record,
          name,
          members: [...members],
          messages,
          isMember: members.some((member) => member.toLowerCase() === address.toLowerCase()),
        };
      }));

      setGroups(loaded);
      setSelectedId((current) => current && loaded.some((group) => group.record.id === current) ? current : loaded[0]?.record.id ?? '');
    } catch (cause) {
      setError(readableRpcError(cause, copy.failed, copy.rateLimited));
    } finally {
      setLoading(false);
    }
  }, [address, copy.encrypted, copy.failed, copy.noKey, copy.rateLimited, isCorrectChain, publicClient, readEnvelopeKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (receipt.isSuccess) {
      setStatus(copy.confirmed);
      setModal(null);
      setGroupName('');
      setMemberInput('');
      setMessage('');
      void refresh();
    }
  }, [copy.confirmed, receipt.isSuccess, refresh]);

  const parsedMemberInput = useMemo(() => parseMemberInput(memberInput, address), [address, memberInput]);

  async function memberKeys(members: `0x${string}`[]) {
    if (!publicClient) throw new Error(copy.failed);
    const keys: GroupMemberKey[] = [];
    for (const member of members) {
      const publicKey = await withRpcRetry(() => publicClient.readContract({
        address: arcanumMessengerAddress,
        abi: arcanumMessengerAbi,
        functionName: 'encryptionKeys',
        args: [member],
      }), { retries: 4, baseDelayMs: 750 }) as string;
      if (!publicKey) throw new Error(`${copy.keyMissing} ${short(member)}`);
      keys.push({ address: member, publicKey });
    }
    return keys;
  }

  async function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !publicClient || !modal) return;
    setError('');

    if (!groupName.trim() || parsedMemberInput.invalid || parsedMemberInput.members.length < 2) {
      setError(copy.invalidMembers);
      return;
    }
    if (parsedMemberInput.members.length > 25) {
      setError(copy.tooMany);
      return;
    }

    try {
      setStatus(copy.preparing);
      const keys = await memberKeys(parsedMemberInput.members);
      const groupId = modal === 'create' ? createRandomGroupId() : selected!.record.id;
      const epoch = modal === 'create' ? 1 : Number(selected!.record.currentEpoch) + 1;
      const encrypted = await createGroupEncryption(groupName.trim(), address, keys, {
        chainId: arcNetwork.id,
        contractAddress: arcanumGroupsAddress,
        groupId,
        epoch,
      });
      setStatus(copy.saving);
      const nextHash = await writeContractAsync({
        address: arcanumGroupsAddress,
        abi: arcanumGroupsAbi,
        functionName: modal === 'create' ? 'createGroup' : 'updateMembers',
        args: [groupId, parsedMemberInput.members, encrypted.encryptedMetadata, encrypted.envelopes],
        chainId: arcNetwork.id,
      });
      setHash(nextHash);
      setStatus(copy.pending);
    } catch (cause) {
      const value = readableRpcError(cause, copy.failed, copy.rateLimited);
      setError(value.includes('LOCAL_KEY') || value.includes('NO_LOCAL_KEY') ? copy.unlock : value);
      setStatus('');
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !selected || !message.trim()) return;
    setError('');
    try {
      setStatus(copy.preparing);
      const epoch = Number(selected.record.currentEpoch);
      const key = await readEnvelopeKey(selected.record.id, epoch, address);
      if (!key) throw new Error(copy.noKey);
      const payload = await encryptGroupMessage(message.trim(), key, address, {
        chainId: arcNetwork.id,
        contractAddress: arcanumGroupsAddress,
        groupId: selected.record.id,
        epoch,
      });
      if (new TextEncoder().encode(payload).length > 4096) throw new Error('Encrypted message is too large.');
      setStatus(copy.saving);
      const nextHash = await writeContractAsync({
        address: arcanumGroupsAddress,
        abi: arcanumGroupsAbi,
        functionName: 'sendGroupMessage',
        args: [selected.record.id, BigInt(epoch), payload],
        value: groupMessageFee,
        chainId: arcNetwork.id,
      });
      setHash(nextHash);
      setStatus(copy.pending);
    } catch (cause) {
      const value = readableRpcError(cause, copy.failed, copy.rateLimited);
      setError(value.includes('LOCAL_KEY') || value.includes('NO_LOCAL_KEY') ? copy.unlock : value);
      setStatus('');
    }
  }

  function openCreate() {
    setGroupName('');
    setMemberInput('');
    setError('');
    setModal('create');
  }

  function openMembers() {
    if (!selected || !address) return;
    setGroupName(selected.name);
    setMemberInput(selected.members.filter((member) => member.toLowerCase() !== address.toLowerCase()).join('\n'));
    setError('');
    setModal('members');
  }

  function closeModal() {
    setModal(null);
    setError('');
  }

  const unavailable = !isConnected ? copy.noWallet : !isCorrectChain ? copy.wrongChain : !isArcanumGroupsConfigured ? copy.notConfigured : '';

  return (
    <>
      <section className="panel relative min-h-[640px] overflow-hidden">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2 className="panel-title">{copy.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200">{groups.length} {copy.groupCount}</span>
            <button type="button" onClick={() => void refresh()} disabled={loading || Boolean(unavailable)} className="btn-ghost h-10 px-3">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {copy.refresh}
            </button>
          </div>
        </div>

        {unavailable ? <Notice>{unavailable}</Notice> : null}
        {error && !modal ? <div className="helper-danger mt-4" role="alert">{error}</div> : null}
        {status ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-sm text-sky-100">
            {receipt.isLoading || walletPending ? <Loader2 size={15} className="animate-spin" /> : receipt.isSuccess ? <CheckCircle2 size={15} /> : <ShieldCheck size={15} />}
            <span>{status}</span>
            {hash ? <a className="ml-auto inline-flex items-center gap-1 text-xs underline" href={transactionUrl(hash)} target="_blank" rel="noreferrer">{copy.openExplorer}<ExternalLink size={12} /></a> : null}
          </div>
        ) : null}

        {!unavailable && !loading && groups.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-zinc-800 bg-zinc-950 px-5 py-12 text-center">
            <UsersRound className="mx-auto text-zinc-600" size={30} />
            <p className="mt-4 text-sm font-medium text-zinc-200">{copy.empty}</p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">{copy.emptyBody}</p>
          </div>
        ) : null}

        {groups.length > 0 ? (
          <div className="communication-layout mt-5 min-h-[500px]">
            <div className="grid content-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
              {groups.map((group) => (
                <button key={group.record.id} type="button" onClick={() => setSelectedId(group.record.id)} className={`chat-card p-3 text-left ${selectedId === group.record.id ? 'is-active' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-zinc-100">{group.name}</p>
                    <span className="text-[11px] text-zinc-500">E{group.record.currentEpoch.toString()}</span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">{group.members.length} {copy.memberCount} · {short(group.record.id)}</p>
                </button>
              ))}
            </div>

            {selected ? (
              <div className="flex min-h-[500px] flex-col rounded-lg border border-zinc-800 bg-zinc-950">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4">
                  <div>
                    <h3 className="font-semibold text-zinc-100">{selected.name}</h3>
                    <p className="mt-1 text-xs text-zinc-500">{short(selected.record.owner)} · {selected.members.length} {copy.memberCount}</p>
                  </div>
                  {address && selected.record.owner.toLowerCase() === address.toLowerCase() ? (
                    <button type="button" onClick={openMembers} className="btn-ghost h-9 px-3"><Settings2 size={15} />{copy.manage}</button>
                  ) : null}
                </div>

                {!selected.isMember ? <div className="m-4 helper-warning">{copy.removed}</div> : null}
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {selected.messages.length === 0 ? <Notice>{copy.emptyMessages}</Notice> : selected.messages.map((item) => {
                    const outgoing = address ? item.sender.toLowerCase() === address.toLowerCase() : false;
                    return (
                      <article key={`${item.epoch}-${item.id}`} className={`message-bubble max-w-[88%] rounded-lg border px-3 py-2 ${outgoing ? 'message-bubble-outgoing ml-auto border-emerald-400/25 bg-emerald-400/10' : 'border-zinc-800 bg-zinc-950'}`}>
                        <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${item.decryptable ? 'text-zinc-100' : 'text-zinc-500'}`}>{item.text}</p>
                        <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-zinc-500">
                          <span>{short(item.sender)}</span><span>E{item.epoch.toString()}</span><span>#{item.id.toString()}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <form onSubmit={sendMessage} className="border-t border-zinc-800 p-3">
                  <div className="flex gap-2">
                    <textarea value={message} onChange={(event) => setMessage(event.target.value)} disabled={!selected.isMember || walletPending || receipt.isLoading} rows={2} maxLength={2200} placeholder={copy.message} className="input min-h-[52px] resize-none py-3" />
                    <button type="submit" disabled={!message.trim() || !selected.isMember || walletPending || receipt.isLoading} className="btn-primary w-12 shrink-0"><Send size={17} /><span className="sr-only">{copy.send}</span></button>
                  </div>
                  <p className="mt-2 flex items-center gap-1 text-xs text-zinc-500"><KeyRound size={12} />{copy.fee}: {groupMessageFeeLabel}</p>
                </form>
              </div>
            ) : <Notice>{copy.select}</Notice>}
          </div>
        ) : null}
      </section>

      <button
        type="button"
        onClick={openCreate}
        disabled={Boolean(unavailable) || walletPending || receipt.isLoading}
        className="theme-fab fixed bottom-6 right-6 z-40"
        aria-label={copy.create}
        title={copy.create}
      >
        <Plus size={24} />
      </button>

      {modal ? (
        <Modal label={modal === 'create' ? copy.create : copy.manage} onClose={closeModal} closeDisabled={walletPending || receipt.isLoading}>
          <form onSubmit={submitGroup} className="modal-panel max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div><p className="eyebrow">{copy.eyebrow}</p><h3 className="mt-2 text-xl font-semibold text-white">{modal === 'create' ? copy.create : copy.manage}</h3></div>
              <button type="button" onClick={closeModal} disabled={walletPending || receipt.isLoading} className="btn-ghost h-9 w-9" aria-label={copy.close}><X size={16} /></button>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2"><span className="text-xs font-medium text-zinc-400">{copy.name}</span><input className="input" value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={64} required /></label>
              <label className="grid gap-2"><span className="text-xs font-medium text-zinc-400">{copy.members}</span><textarea className="input min-h-36 resize-y py-3 font-mono text-xs" value={memberInput} onChange={(event) => setMemberInput(event.target.value)} placeholder="0x…\n0x…" /></label>
              <p className="text-xs leading-5 text-zinc-500">{copy.membersHint}</p>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-400"><p>{parsedMemberInput.members.length}/25 {copy.memberCount}</p><p className="mt-2 leading-6">{modal === 'members' ? copy.rekey : copy.privacy}</p></div>
              {error ? <div className="helper-danger" role="alert">{error}</div> : null}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeModal} disabled={walletPending || receipt.isLoading} className="btn-ghost h-10 px-4">{copy.cancel}</button>
              <button type="submit" disabled={!groupName.trim() || parsedMemberInput.invalid || parsedMemberInput.members.length < 2 || walletPending || receipt.isLoading} className="btn-primary h-10 px-4">{walletPending || receipt.isLoading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}{copy.continue}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-500">{children}</div>;
}
