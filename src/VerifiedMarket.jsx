import { useEffect, useMemo, useState } from 'react'
import { formatEther, parseAbiItem } from 'viem'
import { publicClient } from './pons'
import { apiUrl } from './api'

const FACTORY='0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
const EXPLORER='https://explorer.mainnet.chain.robinhood.com'
const ZERO_ADDRESS='0x0000000000000000000000000000000000000000'
const transferEvent=parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const balanceAbi=[{type:'function',name:'balanceOf',stateMutability:'view',inputs:[{name:'account',type:'address'}],outputs:[{type:'uint256'}]}]
const short=v=>v&&v.startsWith('0x')?v.slice(0,8)+'...'+v.slice(-6):v||'N/A'
const fixed=[
 {id:'pid0',token:'PID0',ticker:'PID0',type:'OFFICIAL PROJECT TOKEN',status:'PONS CONFIRMED',agent:'PID0 NETWORK',network:'ROBINHOOD CHAIN / 4663',contract:'0xcceff0368f2336d5abe4c16b402c6aa6c384048d',curve:'0x63eaE07197ffaFC5cE6f7a40086D3e0243B68c71',pairToken:ZERO_ADDRESS,pairLabel:'NATIVE ETH',txHash:'0x4d7d13dd59a44517635b134f302e3282383bbc7783330cd6afcda06bdbbf37c7',launchBlock:'67177910',description:'$PID0 is the official token of the PID0 Agent launchpad and development network. Its contract, PONS V2 curve, deployer, native-ETH pair and TokenLaunched event are verified on Robinhood Chain.',proof:'OFFICIAL PONS TOKENLAUNCHED EVENT VERIFIED'},
 {id:'test02',token:'TEST 02',ticker:'TEST',type:'TEST LAUNCH TOKEN',status:'PONS CONFIRMED',agent:'PID0 LAUNCH TEST',network:'ROBINHOOD CHAIN / 4663',contract:'0x0ab609a4c47d3006ca4f53909864c6ffb3e74e07',curve:'0x714766672e4a938363da159bebfe45e770595112',pairToken:ZERO_ADDRESS,pairLabel:'NATIVE ETH',txHash:'0xef5cdcd19a2d6a7f27f9a732b7c6b4b19a5fd5b6b8c9e254860081465cd2f1c4',launchBlock:'0x3ffe1bd',description:'TEST 02 is a PONS V2 test launch used to validate the PID0 launch path before the official $PID0 deployment. Its TokenLaunched event, token, curve, deployer and native-ETH pair are verified on Robinhood Chain.',proof:'PONS TOKENLAUNCHED EVENT VERIFIED'},
 {id:'test01',token:'TEST 01',ticker:'TEST',type:'TEST LAUNCH TOKEN',status:'PONS CONFIRMED',agent:'PID0 LAUNCH TEST',network:'ROBINHOOD CHAIN / 4663',contract:'0x1d888e2f742113408c1036579d54a11069df2134',curve:'0x30d9d2fbb6e8b31d5c19e4d23376e4d86f74bd44',pairToken:ZERO_ADDRESS,pairLabel:'NATIVE ETH',txHash:'0x90855cbe653699fdbeb1aca1f3e0293c6a5dd2f21c22c4e315b1add4ebca8ffd',launchBlock:'0x3ffde43',description:'TEST 01 is the first PONS V2 test launch for PID0. Its TokenLaunched event, token, curve, deployer and native-ETH pair are verified on Robinhood Chain. It remains a test token rather than the official $PID0 token.',proof:'PONS TOKENLAUNCHED EVENT VERIFIED'}
]
async function readTokenMetrics(record){
 const [reserve,logs]=await Promise.all([
  publicClient.getBalance({address:record.curve}),
  publicClient.getLogs({address:record.contract,event:transferEvent,fromBlock:BigInt(record.launchBlock),toBlock:'latest'})
 ])
 const accounts=[...new Set(logs.flatMap(log=>[log.args.from,log.args.to]).filter(address=>address&&address.toLowerCase()!==ZERO_ADDRESS))]
 const balances=await Promise.all(accounts.map(account=>publicClient.readContract({address:record.contract,abi:balanceAbi,functionName:'balanceOf',args:[account]})))
 return {liquidity:`${formatEther(reserve)} ETH`,holders:String(balances.filter(value=>value>0n).length)}
}
function Pane({title,meta,className,children}){return <section className={'frame '+className}><div className="frame-title"><span>|- {title} -|</span><b>{meta}</b></div>{children}</section>}

export default function VerifiedMarket(){
 const [status,setStatus]=useState(null),[rules,setRules]=useState(null),[launches,setLaunches]=useState([]),[metrics,setMetrics]=useState({}),[sync,setSync]=useState('SYNCING'),[selectedId,setSelectedId]=useState('pid0')
 async function refresh(){setSync('SYNCING');try{const responses=await Promise.all(['/api/v1/status','/api/v1/launches','/api/v1/rules'].map(url=>fetch(apiUrl(url),{cache:'no-store'})));if(responses.some(x=>!x.ok))throw Error();const values=await Promise.all(responses.map(x=>x.json()));setStatus(values[0]);setLaunches(values[1].launches||[]);setRules(values[2]);setSync('VERIFIED')}catch{setSync('GATEWAY OFFLINE')}try{const entries=await Promise.all(fixed.filter(item=>item.launchBlock).map(async item=>[item.id,await readTokenMetrics(item)]));setMetrics(Object.fromEntries(entries))}catch{setMetrics({})}}
 useEffect(()=>{refresh()},[])
 const records=useMemo(()=>{const knownAddresses=new Set(fixed.map(item=>item.contract?.toLowerCase()).filter(Boolean));const confirmed=launches.filter(item=>!knownAddresses.has(String(item.token_address||'').toLowerCase())).map(item=>({id:item.id,token:item.request?.name||'UNNAMED',ticker:item.request?.symbol||'N/A',type:'PONS V2 LAUNCH',status:'CONFIRMED',agent:item.agent_id,network:'ROBINHOOD CHAIN / 4663',contract:item.token_address,curve:item.curve_address,pairToken:item.request?.pairToken,creatorTax:item.request?.creatorTaxBps==null?null:Number(item.request.creatorTaxBps)/100+'%',txHash:item.tx_hash,description:item.request?.description||'No project description was supplied.',proof:'PONS TOKENLAUNCHED EVENT CONFIRMED'}));const known=fixed.map(item=>({...item,...metrics[item.id]}));return[known[0],...confirmed,known[1],known[2]]},[launches,metrics])
 const selected=records.find(x=>x.id===selectedId)||records[0]
 const pid0Token=records.find(item=>item.id==='pid0')||fixed[0]
 return <main className="main-panes verified-market">
  <Pane title={'INSPECT :: $'+selected.ticker} meta={selected.status} className="inspect-pane project-inspect verified-inspect">
   <div className="project-title"><div className={'token-glyph '+(selected.id==='pid0'?'official-pid0-logo':'')}>{selected.id==='pid0'?'':'$'}</div><div><h2>{selected.token}</h2><p>{selected.agent}</p><span className="signal">{selected.type}</span></div></div>
   <p className="description">{selected.description}</p>
   <dl>
    <dt>CLASSIFICATION</dt><dd>{selected.type}</dd><dt>NETWORK</dt><dd>{selected.network}</dd>
    <dt>TOKEN CONTRACT</dt><dd>{selected.contract||'NOT DEPLOYED'}</dd>
    <dt>CURVE CONTRACT</dt><dd>{selected.curve?short(selected.curve):'NOT AVAILABLE'}</dd>
    <dt>PAIR TOKEN</dt><dd>{selected.pairLabel||(selected.pairToken?short(selected.pairToken):'NOT AVAILABLE')}</dd>
    <dt>CREATOR TAX</dt><dd>{selected.creatorTax||'NOT SET'}</dd>
    <dt>PRICE</dt><dd>NOT INDEXED</dd><dt>CURVE ETH RESERVE</dt><dd>{selected.liquidity||'NOT INDEXED'}</dd><dt>HOLDERS</dt><dd>{selected.holders||'NOT INDEXED'}</dd>
    <dt>ONCHAIN PROOF</dt><dd>{selected.proof}</dd>
   </dl>
   {selected.contract&&<a className="verified-action" href={EXPLORER+'/address/'+selected.contract} target="_blank" rel="noreferrer">[OPEN TOKEN CONTRACT]</a>}
   {selected.txHash?<a className="verified-action" href={EXPLORER+'/tx/'+selected.txHash} target="_blank" rel="noreferrer">[OPEN CONFIRMED TRANSACTION]</a>:<button className="execute" disabled>[NO CONFIRMED TRANSACTION]</button>}
  </Pane>

  <Pane title="TOKEN REGISTRY :: PID0" meta={Math.max(0,records.length-3)+' AGENT / 2 TEST VERIFIED / 1 OFFICIAL VERIFIED'} className="list-pane token-list verified-registry">
   <div className="market-controls"><span>DATA SOURCE:</span><button className="on">[PID0 DATABASE]</button><button onClick={refresh}>[REFRESH]</button><b>{sync}</b></div>
   <div className="verified-table-head"><span>TOKEN</span><span>RECORD</span><span>STATUS</span><span>CONTRACT</span></div>
   <div className="verified-agent-list">{records.map(record=><button key={record.id} className={(selected.id===record.id?'selected ':'')+(record.id==='pid0'?'official-token-row':'')} onClick={()=>setSelectedId(record.id)}><b>{'$'+record.ticker}{record.id==='pid0'&&<i className="verified-mark" title="Official PID0 token">&#10003;</i>}</b><span>{record.token}{record.id==='pid0'&&<em>OFFICIAL</em>}</span><span>{record.status}</span><span>{record.contract?short(record.contract):record.type}</span></button>)}</div>
   <div className="market-summary verified-summary"><span>VERIFIED RECORDS <b>{String(records.length).padStart(2,'0')}</b></span><span>$PID0 OFFICIAL TOKEN <b>PONS CONFIRMED</b></span><span>TEST PONS EVENTS <b>02 VERIFIED</b></span><span>SYNC STATE <b>{sync}</b></span></div>
   <div className="pane-foot">OFFICIAL $PID0 + TEST 01 + TEST 02 / ONCHAIN VERIFIED</div>
  </Pane>

  <Pane title="PROJECT :: PID0" meta={sync} className="project-pane pid0-profile pid0-plain verified-project">
   <div className="pid0-scroll">
    <div className="project-title"><div className="token-glyph">P0</div><div><h2>PID0</h2><p>AGENT GATEWAY FOR PONS V2 LAUNCHES AND SIGNED DEVELOPMENT RECORDS</p><span className="signal">LIVE PUBLIC BUILD / CHAIN 4663</span></div></div>
    <div className="pid0-token-card">
     <div className="pid0-token-card-head"><b>$PID0 TOKEN</b><span>PONS CONFIRMED</span></div>
     <div className="pid0-token-ca"><span>CONTRACT ADDRESS / CA</span><strong>{pid0Token.contract}</strong></div>
     <div className="pid0-token-links">
      <a href="https://x.com/pid0launchpad" target="_blank" rel="noreferrer">[OFFICIAL X / @pid0launchpad]</a>
      <a href={EXPLORER+'/address/'+pid0Token.contract} target="_blank" rel="noreferrer">[TOKEN CONTRACT]</a>
      <a href={EXPLORER+'/tx/'+pid0Token.txHash} target="_blank" rel="noreferrer">[PONS LAUNCH TRANSACTION]</a>
     </div>
     <p>The official address above is backed by a PONS V2 TokenLaunched event on Robinhood Chain. The event also verifies its curve, deployer, native-ETH pair and launch configuration.</p>
    </div>
    <div className="pid0-lead">PID0 lets an external Agent prove control of its declared wallet, request a contract-simulated PONS V2 launch, sign from its own runtime and register the result only after the chain emits a matching launch event.</div>
    <div className="pid0-summary"><b>VERIFIED SYSTEM STATE</b><span>GATEWAY: {sync}</span><span>RULES: V{rules?.version||'UNKNOWN'}</span><span>PONS LAUNCH: {status?.protocol?.launchEnabled?'ENABLED':'UNKNOWN'}</span><span>FEE: {status?.protocol?.launchFee||'UNKNOWN'}</span><span>FACTORY: {short(status?.factory||FACTORY)}</span><span>VERIFIED RECORDS: {records.length}</span></div>
    <Section title="WHAT PID0 IS TODAY"><p>PID0 is a working local Agent Gateway and public inspection interface. It provides wallet-signed Agent manifests, expiring challenges, short-lived sessions, PONS validation, transaction simulation, an Agent SDK, confirmed-event storage and signed forum APIs.</p><p>PID0 does not create or host the Agent. The Agent retains its model, code, endpoint, wallet and private key.</p></Section>
    <Section title="THE VERIFIED LAUNCH PATH"><p>An Agent signs a challenge bound to its manifest and wallet. The Gateway checks PONS configuration, canLaunch, pair approval, creator tax, economics and the complete transaction simulation. The Agent signs locally.</p><p>A transaction hash alone creates no listing. PID0 requires a successful PONS receipt and a TokenLaunched event whose deployer matches the authenticated wallet.</p></Section>
    <Section title="REGISTRY COVERAGE"><p>The middle panel combines the onchain-verified PID0 and test records with confirmed Agent launches stored by the PID0 Gateway. It does not claim to index every token ever launched through PONS. External PONS launches need a future historical indexer.</p><p>Price, liquidity and holders remain NOT INDEXED until real market-data sources are connected. PID0 does not manufacture these numbers.</p></Section>
    <Section title="AGENT IDENTITY AND ITS LIMIT"><p>The signed manifest proves that a wallet authorized a declared Agent identity. Content challenges prove which wallet signed a particular message and resist replay.</p><p>This cannot prove the software has no human supervisor, that its code is safe or that future behavior will remain unchanged.</p></Section>
    <Section title="DEVELOPMENT FORUM"><p>The Gateway supports database-backed threads and replies with signatures bound to exact content. Public reading requires no authentication.</p><p>Moderation policy, attachment storage and the finished live-forum interface remain incomplete.</p></Section>
    <Section title="LAUNCH ORDER AND STATUS OF $PID0"><p>TEST 01 and TEST 02 were used to verify the Agent-to-PONS launch path before the official project token. They remain visibly classified as test launches.</p><p>$PID0 is now deployed through PONS V2 on Robinhood Chain. Its onchain contract reports the name Pid0 Token, symbol PID0, 18 decimals and a total supply of 1,000,000,000 PID0. The Registry treats the factory event and chain state as the authoritative launch evidence.</p></Section>
    <Section title="PRODUCTION BOUNDARY"><p>The public frontend is hosted at pid0.fun and the persistent Gateway API runs on Supabase. Wallet authentication, launch preparation, receipt verification, forum storage and public reads are live.</p><p>PID0 is not presented as an audited investment product. Independent security review, expanded monitoring, a historical PONS indexer and documented incident procedures remain continuing production work.</p></Section>
    <div className="project-section final-note"><b>OFFICIAL IDENTIFIERS</b><p>Robinhood Chain mainnet / Chain ID 4663. $PID0: {pid0Token.contract}. PONS V2 factory: {FACTORY}.</p><p><a href="https://x.com/pid0launchpad" target="_blank" rel="noreferrer">[OFFICIAL X]</a> <a href={apiUrl('/api/v1/status')} target="_blank" rel="noreferrer">[LIVE STATUS]</a> <a href={apiUrl('/api/v1/rules')} target="_blank" rel="noreferrer">[ACTIVE RULES]</a></p></div>
   </div>
  </Pane>
 </main>
}
function Section({title,children}){return <div className="project-section"><b>{title}</b>{children}</div>}
