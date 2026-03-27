# Gubinator Contract Reference

## Network

- **Chain:** Galactica Mainnet
- **Chain ID:** `613419`
- **RPC:** `https://galactica-mainnet.g.alchemy.com/public`

---

## Adresy

| Role | Adresa |
|------|--------|
| **Gubinator** | `0x5b8b96F1828B27165705be802BDCfC79FB8E2ceA` |
| **gUBI** (input token) | `0xFEa4F549eFB1F8B2cBA8d029e6845Ee431e142AA` |
| **WGNET** (output token / reserve) | `0x690F1eEf8AcEaD09Ac695d9111Af081045c6d5b7` |
| **ARCHAI** | `0x22b48a764d2aAAe14d751aD2B5fcdf6C0A4d95D7` |
| **veGNET** | `0xdFbE5AC59027C6f38ac3E2eDF6292672A8eCffe4` |
| **IndexPool** | `0x50AF2AAb1455C1C06B3b8e623549dDE437F54EeF` |
| **Owner / Keeper** | `0x38407d9b0965410e655320a05141A66Bf1f05949` |
| **Quote Signer** | `0x460860F05AF00cF25EC85Ac9812D0bCCF6caF9D4` |

---

## Funkce volané z frontendu

### Read (view)
```
wgnetReserve()        → uint256   — WGNET v reserve
gubiAccumulated()     → uint256   — gUBI cekajici na burn
maxWgnetPerSwap()     → uint256   — per-swap cap
paused()              → bool
quoteSigner()         → address
keeper()              → address
```

### Write (state-modifying)
```
swapWithQuote(Quote quote, bytes signature)   — hlavni swap uzivatele
approve(address spender, uint256 amount)      — na gUBI tokenu pred swapem
burnAccumulated(uint256 amount)               — pouze keeper
```

### Quote struct (pro swapWithQuote)
```solidity
struct Quote {
  address recipient;
  uint256 amountIn;       // gUBI wei
  uint256 amountOut;      // WGNET wei
  uint256 expiry;         // unix timestamp
  uint256 chainId;        // 613419
  address contractAddress; // adresa Gubinatore
  uint256 nonce;
}
```

### Events
```
Swapped(address indexed user, uint256 gubiIn, uint256 wgnetOut, bytes32 quoteHash)
BurnExecuted(uint256 gubiAmount, uint256 wgnetRecovered, uint256 archaiReceived)
```

### Custom Errors (selektory pro UI)
```
0xbf04c5a8  EnforcedPause         → "Swap paused"
0x8727a7f9  QuoteExpired          → "Quote expired"
0x39c3e398  QuoteAlreadyUsed      → "Quote already used"
0x8baa579f  InvalidSignature      → "Invalid signature"
0x10dfc033  WrongChain            → "Wrong network"
0xd348b9b0  WrongContract         → "Wrong contract address"
0xf512b278  OwnableUnauthorized   → "Not permitted"
0x586d3357  NotRecipient          → "Recipient mismatch"
0x1f2a2005  ZeroAmount            → "Amount must be > 0"
0x98642b86  NothingToBurn         → "Nothing to burn"
0x2cb80541  ExceedsMaxPerSwap     → "Exceeds per-swap limit"
```

---

## Swap flow (frontend)

```
1. POST /api/quote { recipient, gubiAmountWei }
   → vraci { quote: Quote, signature: bytes }

2. gUBI.allowance(user, GUBINATOR) < amountIn?
   → gUBI.approve(GUBINATOR, amountIn)

3. Gubinator.swapWithQuote(quote, signature)
   → event Swapped emitted

4. POST /api/notify-swap { gubiIn, wgnetOut, txHash }  (non-critical)
```

---

## ABI (full JSON)

```json
[
  {
    "inputs": [
      { "internalType": "address", "name": "_gubi", "type": "address" },
      { "internalType": "address", "name": "_wgnet", "type": "address" },
      { "internalType": "address", "name": "_archai", "type": "address" },
      { "internalType": "address", "name": "_pool", "type": "address" },
      { "internalType": "address", "name": "_quoteSigner", "type": "address" },
      { "internalType": "address", "name": "_keeper", "type": "address" },
      { "internalType": "uint256", "name": "_maxWgnetPerSwap", "type": "uint256" },
      { "internalType": "address", "name": "_owner", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  { "inputs": [], "name": "ECDSAInvalidSignature", "type": "error" },
  { "inputs": [{ "internalType": "uint256", "name": "length", "type": "uint256" }], "name": "ECDSAInvalidSignatureLength", "type": "error" },
  { "inputs": [{ "internalType": "bytes32", "name": "s", "type": "bytes32" }], "name": "ECDSAInvalidSignatureS", "type": "error" },
  { "inputs": [], "name": "EnforcedPause", "type": "error" },
  { "inputs": [{ "internalType": "uint256", "name": "requested", "type": "uint256" }, { "internalType": "uint256", "name": "max", "type": "uint256" }], "name": "ExceedsMaxPerSwap", "type": "error" },
  { "inputs": [], "name": "ExpectedPause", "type": "error" },
  { "inputs": [{ "internalType": "uint256", "name": "needed", "type": "uint256" }, { "internalType": "uint256", "name": "available", "type": "uint256" }], "name": "InsufficientWgnetReserve", "type": "error" },
  { "inputs": [], "name": "InvalidShortString", "type": "error" },
  { "inputs": [], "name": "InvalidSignature", "type": "error" },
  { "inputs": [], "name": "NotKeeper", "type": "error" },
  { "inputs": [], "name": "NotRecipient", "type": "error" },
  { "inputs": [], "name": "NothingToBurn", "type": "error" },
  { "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }], "name": "OwnableInvalidOwner", "type": "error" },
  { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "OwnableUnauthorizedAccount", "type": "error" },
  { "inputs": [], "name": "QuoteAlreadyUsed", "type": "error" },
  { "inputs": [], "name": "QuoteExpired", "type": "error" },
  { "inputs": [], "name": "ReentrancyGuardReentrantCall", "type": "error" },
  { "inputs": [{ "internalType": "address", "name": "token", "type": "address" }], "name": "SafeERC20FailedOperation", "type": "error" },
  { "inputs": [{ "internalType": "string", "name": "str", "type": "string" }], "name": "StringTooLong", "type": "error" },
  { "inputs": [], "name": "WrongChain", "type": "error" },
  { "inputs": [], "name": "WrongContract", "type": "error" },
  { "inputs": [], "name": "ZeroAddress", "type": "error" },
  { "inputs": [], "name": "ZeroAmount", "type": "error" },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "gubiAmount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "wgnetRecovered", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "archaiReceived", "type": "uint256" }
    ],
    "name": "BurnExecuted",
    "type": "event"
  },
  { "anonymous": false, "inputs": [], "name": "EIP712DomainChanged", "type": "event" },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "oldKeeper", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "newKeeper", "type": "address" }
    ],
    "name": "KeeperUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "oldMax", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "newMax", "type": "uint256" }
    ],
    "name": "MaxWgnetPerSwapUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }
    ],
    "name": "OwnershipTransferStarted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "address", "name": "account", "type": "address" }],
    "name": "Paused",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "oldSigner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "newSigner", "type": "address" }
    ],
    "name": "QuoteSignerUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "gubiIn", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "wgnetOut", "type": "uint256" },
      { "indexed": false, "internalType": "bytes32", "name": "quoteHash", "type": "bytes32" }
    ],
    "name": "Swapped",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "address", "name": "account", "type": "address" }],
    "name": "Unpaused",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "QUOTE_TYPEHASH",
    "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "acceptOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "archai",
    "outputs": [{ "internalType": "contract IERC20", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "amount", "type": "uint256" }],
    "name": "burnAccumulated",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "eip712Domain",
    "outputs": [
      { "internalType": "bytes1", "name": "fields", "type": "bytes1" },
      { "internalType": "string", "name": "name", "type": "string" },
      { "internalType": "string", "name": "version", "type": "string" },
      { "internalType": "uint256", "name": "chainId", "type": "uint256" },
      { "internalType": "address", "name": "verifyingContract", "type": "address" },
      { "internalType": "bytes32", "name": "salt", "type": "bytes32" },
      { "internalType": "uint256[]", "name": "extensions", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "emergencyWithdrawGubi",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "gubi",
    "outputs": [{ "internalType": "contract IERC20", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "gubiAccumulated",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "keeper",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxWgnetPerSwap",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paused",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pendingOwner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pool",
    "outputs": [{ "internalType": "contract IIndexPool", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "quoteSigner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "newKeeper", "type": "address" }],
    "name": "setKeeper",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "newMax", "type": "uint256" }],
    "name": "setMaxWgnetPerSwap",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "newSigner", "type": "address" }],
    "name": "setQuoteSigner",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          { "internalType": "address", "name": "recipient", "type": "address" },
          { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
          { "internalType": "uint256", "name": "amountOut", "type": "uint256" },
          { "internalType": "uint256", "name": "expiry", "type": "uint256" },
          { "internalType": "uint256", "name": "chainId", "type": "uint256" },
          { "internalType": "address", "name": "contractAddress", "type": "address" },
          { "internalType": "uint256", "name": "nonce", "type": "uint256" }
        ],
        "internalType": "struct Gubinator.Quote",
        "name": "quote",
        "type": "tuple"
      },
      { "internalType": "bytes", "name": "signature", "type": "bytes" }
    ],
    "name": "swapWithQuote",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unpause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
    "name": "usedQuoteHash",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "wgnet",
    "outputs": [{ "internalType": "contract IERC20", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "wgnetReserve",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "withdrawArchai",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "withdrawWgnet",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]
```
