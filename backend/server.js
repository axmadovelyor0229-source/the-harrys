const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '30mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, max: 80, standardHeaders: true, legacyHeaders: false }));

const seedUsers = [
  ['superadmin','1234','Elyor Akhmadov','Super Admin',['Magic City','High Town','Cyber Arena','Цех'],['*']],
  ['network.manager','1111','Alisher Karimov','Управляющий сетью',['Magic City','High Town','Cyber Arena','Цех'],['dashboard','branches','stock','inventory','receipts','transfers','writeoffs','requests','sales','equipment','reconcile','warehouse','purchases','reports','productHistory','audit','financeData','rent','tasks']],
  ['ceo','1111',"CEO the harry's",'CEO',['Magic City','High Town','Cyber Arena','Цех'],['ceo','ceoCharts','tasks','branches','rent']],
  ['akmal.r','1111','Akmal Rakhimov','Менеджер — Magic City',['Magic City'],['branches','stock','inventory','receipts','transfers','writeoffs','requests','sales','equipment','reconcile','reports','productHistory','audit']],
  ['nodir.ht','1111','Nodir Xasanov','Менеджер — High Town',['High Town'],['branches','stock','inventory','receipts','transfers','writeoffs','requests','sales','equipment','reconcile','reports','productHistory','audit']],
  ['rustam.cyber','1111','Rustam Aliyev','Менеджер — Cyber Arena',['Cyber Arena'],['branches','stock','inventory','receipts','transfers','writeoffs','requests','sales','equipment','reconcile','reports','productHistory','audit']],
  ['sardor.k','1111','Sardor Karimov','Кассир',['Magic City'],['sales','tasks']],
  ['madina.cash','1111','Madina Karimova','Кассир',['High Town'],['sales','tasks']],
  ['diyor.cash','1111','Diyor Akbarov','Кассир',['Cyber Arena'],['sales','tasks']],
  ['jasur.wh','1111','Jasur M.','Кладовщик',['Цех'],['stock','inventory','receipts','transfers','requests','warehouse','purchases','writeoffs','reports','productHistory','audit']],
  ['bekzod.buy','1111','Bekzod T.','Снабженец',['Цех'],['purchases']]
];

async function initDb(){
  await pool.query(`CREATE TABLE IF NOT EXISTS users(
    id BIGSERIAL PRIMARY KEY, login TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    name TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Активен',
    branches JSONB NOT NULL DEFAULT '[]'::jsonb, perms JSONB NOT NULL DEFAULT '[]'::jsonb,
    profile JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS app_state(
    key TEXT PRIMARY KEY, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS api_audit(
    id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), login TEXT, action TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb
  )`);
  const {rows:[{count}]} = await pool.query('SELECT count(*)::int count FROM users');
  if(count===0){
    for(const [login,password,name,role,branches,perms] of seedUsers){
      const hash=await bcrypt.hash(password,12);
      await pool.query('INSERT INTO users(login,password_hash,name,role,branches,perms) VALUES($1,$2,$3,$4,$5,$6)',[login,hash,name,role,JSON.stringify(branches),JSON.stringify(perms)]);
    }
    console.log('Seed users created. Change all default passwords after first login.');
  }
}
function publicUser(r){return {id:r.id,name:r.name,login:r.login,role:r.role,status:r.status,branches:r.branches||[],perms:r.perms||[],...(r.profile||{})};}
function sign(u){return jwt.sign({sub:String(u.id),login:u.login,role:u.role},JWT_SECRET,{expiresIn:'12h'});}
function auth(req,res,next){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  try{req.auth=jwt.verify(token,JWT_SECRET);next();}catch{res.status(401).json({error:'unauthorized'});}
}
function isAdmin(req){return req.auth?.role==='Super Admin';}
async function audit(login,action,details={}){try{await pool.query('INSERT INTO api_audit(login,action,details) VALUES($1,$2,$3)',[login,action,JSON.stringify(details)]);}catch(e){console.error('audit',e.message)}}

app.get('/api/health', async (_req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,service:'the-harrys-api',time:new Date().toISOString()});}catch(e){res.status(503).json({ok:false,error:'database_unavailable'});}});
app.post('/api/auth/login', async (req,res)=>{
  const login=String(req.body?.login||'').trim(); const password=String(req.body?.password||'');
  const {rows}=await pool.query('SELECT * FROM users WHERE login=$1',[login]); const u=rows[0];
  if(!u || u.status!=='Активен' || !(await bcrypt.compare(password,u.password_hash))){await audit(login,'login_failed');return res.status(401).json({error:'invalid_credentials'});}
  await audit(login,'login_success'); res.json({token:sign(u),user:publicUser(u)});
});
app.get('/api/auth/me',auth,async(req,res)=>{const {rows}=await pool.query('SELECT * FROM users WHERE id=$1',[req.auth.sub]);if(!rows[0])return res.status(401).json({error:'not_found'});res.json({user:publicUser(rows[0])});});

app.get('/api/state',auth,async(req,res)=>{const {rows}=await pool.query("SELECT payload,updated_at,updated_by FROM app_state WHERE key='main'");res.json(rows[0]||{payload:null});});
app.put('/api/state',auth,async(req,res)=>{
  const payload=req.body?.payload; if(!payload || typeof payload!=='object') return res.status(400).json({error:'invalid_payload'});
  await pool.query(`INSERT INTO app_state(key,payload,updated_at,updated_by) VALUES('main',$1,now(),$2)
    ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=now(),updated_by=excluded.updated_by`,[JSON.stringify(payload),req.auth.login]);
  await audit(req.auth.login,'state_saved'); res.json({ok:true});
});
app.post('/api/users/sync',auth,async(req,res)=>{
  if(!isAdmin(req)) return res.status(403).json({error:'forbidden'});
  const list=Array.isArray(req.body?.users)?req.body.users:[];
  for(const u of list){
    if(!u?.login||!u?.name||!u?.role) continue;
    const profile={phone:u.phone||'',shift:u.shift||'',zone:u.zone||'',workStatus:u.workStatus||'',note:u.note||'',orgRole:u.orgRole||u.role};
    const existing=await pool.query('SELECT id,password_hash FROM users WHERE login=$1',[u.login]);
    let hash=existing.rows[0]?.password_hash;
    if(u.password && String(u.password).length>=4) hash=await bcrypt.hash(String(u.password),12);
    if(!hash) hash=await bcrypt.hash(Math.random().toString(36).slice(2)+Date.now(),12);
    await pool.query(`INSERT INTO users(login,password_hash,name,role,status,branches,perms,profile,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
      ON CONFLICT(login) DO UPDATE SET password_hash=$2,name=$3,role=$4,status=$5,branches=$6,perms=$7,profile=$8,updated_at=now()`,
      [u.login,hash,u.name,u.role,u.status||'Активен',JSON.stringify(u.branches||[]),JSON.stringify(u.perms||[]),JSON.stringify(profile)]);
  }
  await audit(req.auth.login,'users_synced',{count:list.length}); res.json({ok:true,count:list.length});
});

async function iikoToken(){
  const apiLogin=process.env.IIKO_API_LOGIN; if(!apiLogin) throw new Error('IIKO_API_LOGIN is not configured');
  const base=(process.env.IIKO_API_BASE||'https://api-ru.iiko.services/api/1').replace(/\/$/,'');
  const r=await fetch(base+'/access_token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiLogin})});
  if(!r.ok) throw new Error('iiko token HTTP '+r.status); return (await r.json()).token;
}
app.get('/api/iiko/status',auth,async(req,res)=>{
  if(!['Super Admin','CEO','Управляющий сетью'].includes(req.auth.role)) return res.status(403).json({error:'forbidden'});
  try{const token=await iikoToken();res.json({ok:true,configured:true,tokenReceived:Boolean(token)});}catch(e){res.status(503).json({ok:false,configured:Boolean(process.env.IIKO_API_LOGIN),error:e.message});}
});
app.get('/api/iiko/organizations',auth,async(req,res)=>{
  if(!['Super Admin','CEO','Управляющий сетью'].includes(req.auth.role)) return res.status(403).json({error:'forbidden'});
  try{const token=await iikoToken();const base=(process.env.IIKO_API_BASE||'https://api-ru.iiko.services/api/1').replace(/\/$/,'');const r=await fetch(base+'/organizations',{method:'POST',headers:{'content-type':'application/json','Authorization':'Bearer '+token},body:'{}'});const data=await r.json();res.status(r.status).json(data);}catch(e){res.status(503).json({error:e.message});}
});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'internal_error'});});
initDb().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log('API listening on '+PORT))).catch(e=>{console.error(e);process.exit(1)});
