# Arcanum mainnet review — 2026-09-26

## Result

All six application contracts are deployed on Arc mainnet (chain 5042). No missing application contract was found, so no deployment, fee claim or other mainnet transaction was sent. No exploitable fund-theft or authorization bypass was demonstrated in the reviewed Solidity and adversarial tests. This is a source/runtime review and regression test pass, not a formal proof or independent external audit.

The read-only snapshot in `mainnet-contract-audit.json` records the block hash, executable-code comparison, addresses, balances and dependency getters. Solidity metadata is excluded from executable comparison; compiler immutable ranges are normalized and their public getters are checked against the manifest. This does not claim explorer source verification.

| Contract | Mainnet address | Checked responsibilities |
| --- | --- | --- |
| Messenger | `0xC0043A981650ed85ae89f1c2f60E826D39aC365e` | Sender attribution, fees, claim authorization, bounded messages |
| Agents | `0x2AB26Cf3216852c89BcEea8AAd16e2b96E628108` | Active-agent checks, payment rollback, fees, recipient reentrancy |
| Groups | `0x6bB716DB0bce5aFA206C93246d8764D17CE456aD` | Owner/member permissions, epoch rotation, Messenger registry link |
| BulkSender | `0xD0aFc0209547986D777CA345aE7ee5F8fcd741D7` | Exact totals, batch bounds, atomic failure, reentrancy |
| GigBoard | `0xE238054755B41cA6bDe7C848F9b3e92BCEE22b4A` | Participant permissions, proposal state, single winner, Escrow link |
| Escrow | `0xf9DD777185da559aDadbf298092DE7e6A050a93E` | Payer/provider/arbiter permissions, single payout, disputes, board link |

## Fixed issues

1. **Wrong registry during Groups deployment:** the individual script defaulted to the testnet Messenger even on mainnet. It now resolves the selected network manifest and verifies Messenger executable code first.
2. **Incomplete old suite script:** the local mainnet suite did not call `configureEscrow`. It now delegates to the common script that establishes the binding. The live mainnet pair was correctly bound; no repair transaction was needed.
3. **Duplicate/wrong-chain deployment:** deployment entry points check the actual chain and refuse to overwrite recorded deployments. Recorded addresses without code stop for investigation rather than silently redeploying.
4. **Mainnet build regression:** corrected the overly broad TypeScript type predicate in the testnet-address fallback filter.
5. **Web runtime advisories:** upgraded Next.js and its ESLint config from 15.5.20 to 15.5.26. Production dependency audit reports zero critical findings; transitive high/moderate findings remain, including Circle/wallet SDK trees. SDKs were not downgraded to versions without mainnet support. This is not a vulnerability-free dependency-tree claim.

The current GitHub mainnet migration was merged into the stale local branch, preserving local deployment work.

## Limitations

- Escrow deadlines flag overdue work; they do not automatically release or refund. A disputed escrow depends on its chosen arbiter. An unavailable arbiter or permanently rejecting recipient can delay resolution. This existing, tested policy was not silently changed.
- Private data is encrypted in the browser; Solidity visibility does not hide blockchain contents. Client-side encryption validation remains necessary.
- Group IDs are caller-chosen and globally unique. Copying a pending group ID can make creation revert; this does not grant membership in an existing group. Regenerate the ID on collision. Unbounded legacy array getters can become expensive; prefer pagination.
- Fee claims use the fixed developer wallet; no fee-admin rotation exists.
- `Arcanum.sol` is an unused legacy prototype, not an additional application contract awaiting deployment. Its nonce is stored metadata, not enforced replay prevention; the misleading comment was corrected. Test harnesses are not production services.
- Live contracts are immutable. No active production Solidity code was changed or replaced. Local changes cannot patch already-deployed code.
- No real purchases, signing, funding, releases, refunds or claims were performed on mainnet.

## Reproduce

`npm run audit:mainnet` performs read-only, block-pinned RPC checks and writes a JSON snapshot. `npm run test:contracts` includes adversarial deployment, reentrancy, Escrow and Onramp tests. `npm run test:agent-runner` covers runner funding guards. `npm run build` validates the production application and types.

## References

## Validation results

- 91 Hardhat tests passed, including 11 adversarial/deployment audit tests and 9 Onramp authorization/API tests.
- 4 agent-runner tests passed.
- TypeScript, zero-warning ESLint, and Next.js 15.5.26 production build passed.
- Local production HTTP: Onramp status returns `configured:false` and chain 5042; session POST returns controlled 503 without configuration.
- Chromium: desktop English and mobile Turkish Onramp unavailable state, mobile navigation and themes inspected. Live purchases remain untested without a Circle production key.

## Sources

- [Arc network configuration](https://docs.arc.io/arc/references/connect-to-arc)
- [Next.js Windows advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36)
- [Next.js image optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)
